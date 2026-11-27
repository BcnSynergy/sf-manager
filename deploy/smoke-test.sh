#!/bin/sh
# Smoke test for the production stack (EN-91; spec `deployment`, "Images
# built and published by CI"). Builds the images from docker-compose.prod.yml,
# starts the edge proxy (deploy/edge) and the whole stack behind it on
# https://localhost with throwaway secrets, checks that the API and the web
# app answer through the edge proxy with the security headers, that plain
# HTTP redirects to HTTPS, that the login limit counts the real client
# address (TRUST_PROXY=2), that Docker reports the API healthy
# (EN-92), that the API can write uploaded
# files and that the backup service writes a dump and an archive of the
# uploaded files (TD-42), that the off-site copy service, unconfigured,
# reports that it is disabled (EN-104), that the documented admin seed
# command creates a system admin who can log in (EN-93), that the demo
# stack (docker-compose.demo.yml) answers on https://demo.localhost through
# the same edge proxy, marked noindex, with the demo dataset seeded and
# restored by its reset, and cannot reach the production web (EN-248), and
# that a dump taken before the
# newest migration restores, with its uploaded files, and the API then
# applies that migration (EN-105, EN-120), then removes the stacks, the edge
# proxy and their volumes. CI runs it on every PR and push to main; run it
# from the repository root:
#
#   sh deploy/smoke-test.sh
#
# Ports 80 and 443 must be free, and no other edge proxy (its sf-edge and
# sf-edge-demo networks) may exist on the machine. It uses its own Compose projects and
# volumes, and a Compose override puts backups in a volume instead of the
# checkout's backups/, so nothing lands next to a real stack's backups
# (EN-119).
set -eu

project=sf-manager-smoke
edge_project=sf-edge-smoke
edge_env=$(mktemp)
echo 'SFMANAGER_SITE=localhost' >"$edge_env"
override=$(mktemp)
cat >"$override" <<'EOF'
services:
  backup:
    volumes:
      - smoke-backups:/backups
  offsite:
    volumes:
      - smoke-backups:/backups
volumes:
  smoke-backups:
EOF
env_file=$(mktemp)
cat >"$env_file" <<EOF
SITE_ADDRESS=localhost
POSTGRES_USER=smoke
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=sfmanager
JWT_SECRET=$(openssl rand -hex 32)
THROTTLE_KEY_SECRET=$(openssl rand -hex 32)
SMTP_HOST=smtp.invalid
SMTP_USER=smoke
SMTP_PASSWORD=$(openssl rand -hex 16)
SMTP_FROM=SF-Manager <no-reply@smoke.invalid>
EOF
# Last check (EN-92): an API that exits before it serves, as after a failed
# migration.
failing_api=$(mktemp)
cat >"$failing_api" <<'EOF'
services:
  api:
    command: ['sh', '-c', 'echo smoke: simulated start failure; exit 1']
EOF

compose() {
  docker compose -p "$project" -f docker-compose.prod.yml -f "$override" \
    --env-file "$env_file" "$@"
}

demo_project=sf-manager-demo-smoke
demo_env=$(mktemp)
cat >"$demo_env" <<EOF
SITE_ADDRESS=demo.localhost
POSTGRES_USER=demo
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=sfmanager
JWT_SECRET=$(openssl rand -hex 32)
THROTTLE_KEY_SECRET=$(openssl rand -hex 32)
SEED_ADMIN_EMAIL=demo-admin@example.com
SEED_ADMIN_PASSWORD=$(openssl rand -hex 16)
EOF

demo() {
  docker compose -p "$demo_project" -f docker-compose.prod.yml \
    -f docker-compose.demo.yml --env-file "$demo_env" "$@"
}

edge() {
  docker compose -p "$edge_project" -f deploy/edge/docker-compose.yml \
    --env-file "$edge_env" "$@"
}

# The stacks first: the edge proxy's networks cannot go while a stack's web
# container is attached to them.
cleanup() {
  demo down -v --remove-orphans >/dev/null 2>&1 || true
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  edge down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$env_file" "$override" "$failing_api" "$edge_env" "$demo_env"
}
trap cleanup EXIT
# dash skips the EXIT trap on a signal, so exit explicitly (Ctrl-C locally).
trap 'exit 130' INT TERM

fail() {
  echo "smoke: $1" >&2
  compose ps -a >&2 || true
  compose logs --tail 40 >&2 || true
  edge logs --tail 20 >&2 || true
  exit 1
}

# The edge proxy creates the sf-edge network the stack joins.
edge up -d || fail "docker compose up of the edge proxy failed"
compose up -d --build || fail "docker compose up failed"

# The API applies migrations before it listens, so allow it a while. $1
# names the phase for the failure message.
wait_healthy() {
  health=''
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    health=$(curl -fsk --max-time 5 https://localhost/api/health 2>/dev/null || true)
    [ "$health" = '{"status":"ok","db":"ok"}' ] && break
    attempt=$((attempt + 1))
    sleep 2
  done
  [ "$health" = '{"status":"ok","db":"ok"}' ] ||
    fail "$1: /api/health never returned {\"status\":\"ok\",\"db\":\"ok\"} (last: '$health')"
}
wait_healthy "first start"
echo "smoke: /api/health ok"

# EN-92: Docker's own healthcheck on the API must agree. It can lag the
# request above by one probe, so allow a few.
api_health=''
attempt=0
while [ "$attempt" -lt 15 ]; do
  api_health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$(compose ps -q api)" 2>/dev/null || echo unknown)
  [ "$api_health" = healthy ] && break
  attempt=$((attempt + 1))
  sleep 2
done
[ "$api_health" = healthy ] ||
  fail "the api container's healthcheck reports '$api_health', expected healthy"
echo "smoke: api container healthy"

status=$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' https://localhost/) || status=000
[ "$status" = 200 ] || fail "the web app answered $status, expected 200"
echo "smoke: web app 200"

# The web service's Caddy sets the security headers behind the edge proxy
# (spec `deployment`, "Security headers"). No HSTS on localhost: it keys on
# the Host header, so this also shows the edge proxy passes Host on.
headers=$(curl -sk --max-time 10 -D - -o /dev/null https://localhost/ | tr -d '\r') ||
  fail "could not read the web app's headers"
for header in 'x-content-type-options: nosniff' \
  'referrer-policy: strict-origin-when-cross-origin' \
  "content-security-policy: default-src 'self'"; do
  printf '%s\n' "$headers" | grep -qi "^$header" ||
    fail "the web app's response lacks '$header'"
done
if printf '%s\n' "$headers" | grep -qi '^strict-transport-security:'; then
  fail "https://localhost/ carries HSTS (is the Host header lost on the way?)"
fi
echo "smoke: security headers through the edge proxy, no HSTS on localhost"

# The edge proxy redirects plain HTTP to HTTPS (spec `deployment`, "HTTPS").
redirect=$(curl -s --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' \
  http://localhost/) || redirect=000
case $redirect in
  '301 https://localhost/' | '308 https://localhost/') ;;
  *) fail "http://localhost/ answered '$redirect', expected a redirect to https://localhost/" ;;
esac
echo "smoke: plain HTTP redirects to HTTPS"

# Uploaded files (the organization logo) go to the api-files volume, so the
# API's user must be able to write there (spec `deployment`, "Persistent
# data and secrets").
# shellcheck disable=SC2016 # expanded in the container
compose exec -T api sh -c 'probe="$FILE_STORAGE_DIR/.smoke-probe" && touch "$probe" && rm "$probe"' ||
  fail "the API cannot write to FILE_STORAGE_DIR"
echo "smoke: API can write uploaded files"

# The first backup starts with the API, so it is normally done already. The
# files archive is written after the dump.
attempt=0
until compose logs backup | grep -q 'backup: wrote sfmanager-.*\.files\.tar\.gz'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 15 ] || fail "the backup service wrote no files archive"
  sleep 2
done
compose logs backup | grep -q 'backup: wrote sfmanager-.*\.dump' ||
  fail "the backup service wrote no dump"
echo "smoke: backup service wrote a dump and a files archive"

# Off-site copies are off without OFFSITE_* settings, and the service must
# say so and keep running instead of failing (EN-104).
attempt=0
until compose logs offsite | grep -q 'offsite: off-site copy disabled'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 15 ] || fail "the offsite service did not report that it is disabled"
  sleep 2
done
offsite=$(compose ps -q offsite)
if [ -z "$offsite" ] || [ "$(docker inspect -f '{{.State.Running}}' "$offsite")" != true ]; then
  fail "the offsite service is not running"
fi
echo "smoke: offsite service disabled and idle"

# The documented admin seed command (README, spec `deployment`, "First
# admin") runs the seed compiled into the image, which no build step
# executes (EN-93), so run it here and check it left exactly that admin. No
# earlier step creates users, so the user table holds only that admin.
SEED_ADMIN_EMAIL=smoke-admin@example.com
SEED_ADMIN_PASSWORD=$(openssl rand -hex 16)
export SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
if ! seed_output=$(compose run --rm -T -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD   api npx prisma db seed 2>&1); then
  echo "$seed_output" >&2
  fail "the admin seed command failed"
fi
users=$(compose exec -T postgres psql -U smoke -d sfmanager -tA -F ' ' \
  -c 'select email, role from "User"')
[ "$users" = "$SEED_ADMIN_EMAIL SYSTEM_ADMIN" ] ||
  fail "the admin seed left users '$users', expected '$SEED_ADMIN_EMAIL SYSTEM_ADMIN'"
status=$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}" \
  https://localhost/api/auth/login) || status=000
[ "$status" = 200 ] || fail "the seeded admin's login answered $status, expected 200"
echo "smoke: admin seed created the system admin, who can log in"

# The login limit counts per client address (spec `authentication`, "Client
# IP Resolution for Rate Limiting"), which the API reads two hops back,
# through the edge proxy and the web service's Caddy (TRUST_PROXY=2). Use up
# this host's limit with failed logins (a new email each time, so the
# per-email limit never applies), then log in from another address: a
# container on the sf-edge network. Were one address counted for every
# client (the edge proxy's or the web service's), that login would be
# refused too. Each attempt also sends a different spoofed X-Forwarded-For,
# which must not spread the host's attempts over several keys (the spec's
# "Spoofed forwarding header"); with TRUST_PROXY=2 the API counts from the
# right, so this holds as long as the hop count is right. 15 leaves
# room above the per-client limit (LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 10 by
# default, which the stack does not change) plus the admin's login above.
limited=''
attempt=0
while [ "$attempt" -lt 15 ]; do
  attempt=$((attempt + 1))
  status=$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' -H "X-Forwarded-For: 198.51.100.$attempt" \
    -d "{\"email\":\"smoke-ip-$attempt@example.com\",\"password\":\"wrong-password\"}" \
    https://localhost/api/auth/login) || status=000
  case $status in
    401) ;;
    429) limited=yes && break ;;
    *) fail "a failed login answered $status, expected 401 or 429" ;;
  esac
done
[ -n "$limited" ] || fail "15 failed logins from one address were never limited"
# Pinned by digest like the stack's images; Dependabot does not read this
# script, so it moves only by hand.
status=$(docker run --rm --network sf-edge \
  curlimages/curl:8.11.1@sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69 \
  -sk --max-time 10 -o /dev/null -w '%{http_code}' \
  --connect-to localhost:443:caddy:443 -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}" \
  https://localhost/api/auth/login) || status=000
[ "$status" = 200 ] ||
  fail "a login from another address answered $status after this host was limited, expected 200"
echo "smoke: the login limit counts the real client address through the edge proxy"

# The demo stack (spec `deployment`, "Demo stack"): the same images under
# its own project behind the same edge proxy, on demo.localhost. Its reset
# service seeds the demo dataset when it starts (spec `demo-seed-data`).
demo_fail() {
  demo ps -a >&2 || true
  demo logs --tail 40 >&2 || true
  fail "$1"
}
demo_curl() {
  curl -sk --max-time 10 --resolve demo.localhost:443:127.0.0.1 "$@"
}
demo_sql() {
  demo exec -T postgres psql -U demo -d sfmanager -tAc "$1"
}
demo_codes() {
  demo_sql "select string_agg(code, ',' order by code) from \"InspectableElement\""
}
# The override itself puts the demo web on sf-edge-demo under the demo's
# alias only, whatever demo.env says (EN-248): this env file sets neither.
# Without `!override`, Compose would add production's alias back.
# shellcheck disable=SC2016 # JavaScript, not shell
web_networks=$(demo config --format json | node -e '
  let d = "";
  process.stdin.on("data", (c) => (d += c)).on("end", () => {
    const c = JSON.parse(d);
    const nets = c.services.web.networks;
    console.log(Object.keys(nets).map((k) =>
      `${c.networks[k].name}=${(nets[k] && nets[k].aliases || []).join("+")}`).sort().join(" "));
  });') || demo_fail "could not render the demo stack's config"
[ "$web_networks" = "sf-edge-demo=sf-manager-demo-web ${demo_project}_default=" ] ||
  demo_fail "the demo web's networks are '$web_networks', expected only sf-edge-demo with the demo's alias"
echo "smoke: the demo override pins the demo web to its own edge network and alias"

demo up -d --no-build || demo_fail "docker compose up of the demo stack failed"
seeded=''
i=0
while [ "$i" -lt 60 ]; do
  i=$((i + 1))
  if demo logs reset 2>/dev/null | grep -q 'demo-reset: done'; then
    seeded=yes && break
  fi
  if demo logs reset 2>/dev/null | grep -q 'demo-reset: reset failed'; then
    break
  fi
  sleep 5
done
[ -n "$seeded" ] || demo_fail "the demo reset did not seed the demo dataset"
echo "smoke: demo stack up and seeded by its reset service"

robots=$(demo_curl -D - -o /dev/null https://demo.localhost/ | tr -d '\r' |
  sed -n 's/^[Xx]-[Rr]obots-[Tt]ag: *//p') || robots=''
[ "$robots" = 'noindex, nofollow' ] ||
  demo_fail "the demo answered X-Robots-Tag '$robots', expected 'noindex, nofollow'"
# Production's headers are read first, so a failed request fails the check
# instead of passing for lack of the header. curl runs alone, so its own
# status is the one checked.
prod_headers=$(curl -sk --max-time 10 -D - -o /dev/null https://localhost/) ||
  fail "could not read production's headers"
prod_headers=$(printf '%s\n' "$prod_headers" | tr -d '\r')
case $prod_headers in
  'HTTP/'*' 200'*) ;;
  *) fail "production did not answer 200 when checking for X-Robots-Tag" ;;
esac
if printf '%s\n' "$prod_headers" | grep -qi '^x-robots-tag:'; then
  fail "production answered with an X-Robots-Tag header"
fi
echo "smoke: the demo is marked noindex, production is not"

status=$(demo_curl -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"email":"gestor@demo.sf-manager.example","password":"sf-manager-demo-1"}' \
  https://demo.localhost/api/auth/login) || status=000
[ "$status" = 200 ] || demo_fail "a demo account's login answered $status, expected 200"
echo "smoke: a demo account logs in on the demo"

# The QR codes are fixed (spec `demo-seed-data`, "Fixed Element Codes"), and
# a reset brings back exactly the seeded data after a visitor's changes.
codes=$(demo_codes) || codes=''
[ "$(printf '%s' "$codes" | tr ',' '\n' | grep -c '^DEM..EXT2[2-6]$')" = 24 ] ||
  demo_fail "expected 24 fixed demo codes, found '$codes'"
demo_sql "delete from \"QuestionAnswer\"; delete from \"ElementReviewEntry\"; delete from \"ReviewSession\"; update \"InspectableElement\" set name = 'changed by a visitor'" >/dev/null ||
  demo_fail "could not change the demo data"
# The README's command, inside sh -c so Git Bash on Windows leaves the
# container path alone.
demo exec -T reset sh -c 'sh /usr/local/bin/demo-reset.sh once' >/dev/null ||
  demo_fail "demo-reset.sh once failed"
[ "$(demo_codes)" = "$codes" ] || demo_fail "the reset changed the demo's QR codes"
[ "$(demo_sql "select count(*) from \"ReviewSession\"")" = 12 ] ||
  demo_fail "after the reset, expected the 12 seeded review sessions"
[ "$(demo_sql "select count(*) from \"InspectableElement\" where name = 'changed by a visitor'")" = 0 ] ||
  demo_fail "the reset kept a visitor's change"
echo "smoke: the demo reset restores the same data and QR codes"

# EN-248: the production web's Caddy trusts the forwarding header from any
# private address, so nothing of the demo may reach it. The demo's edge
# network holds the edge proxy and the demo web only.
if docker run --rm --network sf-edge-demo \
  curlimages/curl:8.11.1@sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69 \
  -s --max-time 10 -o /dev/null http://sf-manager-prod-web:80/ >/dev/null 2>&1; then
  fail "a container on the demo's edge network reached the production web"
fi
status=$(docker run --rm --network sf-edge-demo \
  curlimages/curl:8.11.1@sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69 \
  -s --max-time 10 -o /dev/null -w '%{http_code}' http://sf-manager-demo-web:80/) || status=000
[ "$status" = 200 ] || demo_fail "the demo web answered $status on its own edge network, expected 200"
echo "smoke: the demo's edge network reaches the demo web but not the production web"
demo down -v --remove-orphans >/dev/null 2>&1 || fail "could not remove the demo stack"

# A dump taken on an older version restores, with its uploaded files, and
# the API then applies the newer migrations (spec `deployment`, "Restore").
# The database is rebuilt without the newest migration by a one-off API
# container whose copy of the migrations lacks it; the image itself is
# unchanged.
sql() {
  compose exec -T postgres psql -U smoke -d sfmanager -tAc "$1"
}
applied() {
  sql 'select count(*) from _prisma_migrations where finished_at is not null'
}
migrations=$(find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l)
migrations=$((migrations))
compose stop api >/dev/null 2>&1 || fail "could not stop the API"
# shellcheck disable=SC2016 # expanded in the container
compose exec -T backup sh -c 'dropdb --maintenance-db=postgres --force "$PGDATABASE" &&
  createdb --maintenance-db=postgres "$PGDATABASE"' || fail "could not recreate the database"
# shellcheck disable=SC2016 # expanded in the container
compose run --rm --no-deps -T -u root api sh -c 'for m in prisma/migrations/2*; do newest=$m; done &&
  rm -r "$newest" && npx prisma migrate deploy' >/dev/null ||
  fail "could not migrate to the version before the newest migration"
[ "$(applied)" = $((migrations - 1)) ] ||
  fail "expected $((migrations - 1)) migrations before the dump, found $(applied)"
sql "create table smoke_marker (v text); insert into smoke_marker values ('from-dump')" >/dev/null
# Written as the API's user, so the restore must keep that owner (EN-120).
# shellcheck disable=SC2016 # expanded in the container
compose run --rm --no-deps -T api sh -c 'echo from-dump >"$FILE_STORAGE_DIR/smoke-marker"' ||
  fail "could not write the uploaded-file marker"
# The README's commands, so they are checked too.
backup=$(compose run --rm -T backup once) || fail "backup once failed on the older database"
dump=$(printf '%s\n' "$backup" | sed -n 's/^backup: wrote \(sfmanager-[0-9TZ]*\.dump\).*/\1/p')
[ -n "$dump" ] || fail "the backup service wrote no dump of the older database"
compose start api >/dev/null 2>&1 || fail "could not start the API"
wait_healthy "after the dump"
sql 'drop table smoke_marker' >/dev/null
# shellcheck disable=SC2016 # expanded in the container
compose exec -T api sh -c 'echo changed >"$FILE_STORAGE_DIR/smoke-marker"' ||
  fail "could not change the uploaded-file marker"
compose stop api >/dev/null 2>&1 || fail "could not stop the API"
compose run --rm -T backup restore "$dump" >/dev/null ||
  fail "restoring $dump failed"
[ "$(applied)" = $((migrations - 1)) ] ||
  fail "after the restore, expected $((migrations - 1)) migrations, found $(applied)"
compose start api >/dev/null 2>&1 || fail "could not start the API"
wait_healthy "after the restore"
[ "$(applied)" = "$migrations" ] ||
  fail "after the restore, the API applied $(applied) of $migrations migrations"
[ "$(sql 'select v from smoke_marker')" = from-dump ] ||
  fail "the restored database lacks the dump's data"
# shellcheck disable=SC2016 # expanded in the container
marker=$(compose exec -T api sh -c 'm="$FILE_STORAGE_DIR/smoke-marker" && [ -O "$m" ] && cat "$m"') ||
  marker=''
[ "$marker" = from-dump ] ||
  fail "the restored uploaded files lack the dump's marker owned by the API's user (got '$marker')"
echo "smoke: a dump from before the newest migration restores with its uploaded files and the API migrates it"

# password-reset (spec `deployment`, "Outgoing email settings"): without an
# SMTP setting the production API refuses to start and names it. Bounded:
# an API that ignored the setting would start and never return.
smtp_status=0
out=$(timeout 120 docker compose -p "$project" -f docker-compose.prod.yml \
  -f "$override" --env-file "$env_file" \
  run --rm -e SMTP_HOST= api node dist/main 2>&1) || smtp_status=$?
[ "$smtp_status" != 0 ] || fail "the API exited cleanly without SMTP_HOST"
[ "$smtp_status" != 124 ] || fail "the API kept running without SMTP_HOST"
case $out in
  *"SMTP_HOST must be set in production"*) ;;
  *) fail "the API refused to start without naming SMTP_HOST: $out" ;;
esac
echo "smoke: an API without SMTP_HOST refuses to start and names it"

# EN-92: when the API never becomes healthy, the start command must fail
# naming it, and Caddy must stay down instead of answering 502.
# The earlier checks left Caddy running: remove it, so up -d has to create
# it again and we can see whether it starts.
compose rm -sf web >/dev/null 2>&1 || fail "could not remove the web container"
# Bounded, so a Compose that never gives up on the restarting API fails the
# check instead of hanging the job.
up_status=0
out=$(timeout 300 docker compose -p "$project" -f docker-compose.prod.yml \
  -f "$override" -f "$failing_api" --env-file "$env_file" up -d 2>&1) || up_status=$?
[ "$up_status" != 0 ] || fail "up -d succeeded although the API cannot start"
[ "$up_status" != 124 ] || fail "up -d was still waiting for the API after 300 s"
# Compose names the API as unhealthy (it restarts, unless-stopped) or, in
# other versions, as exited; either way it must name the API.
case $out in
  *"container $project-api-1 is unhealthy"* | *"container $project-api-1 exited"*) ;;
  *) fail "up -d failed without naming the API: $out" ;;
esac
# Created but never started (or not created at all): not running, and not
# restarting either.
web_state=$(compose ps -a --format '{{.State}}' web) ||
  fail "could not read the web container's state"
case $web_state in
  '' | created) ;;
  *) fail "Caddy is '$web_state' although the API is unhealthy" ;;
esac
echo "smoke: an API that cannot start fails up -d and keeps Caddy down"
