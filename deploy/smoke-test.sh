#!/bin/sh
# Smoke test for the production stack (EN-91; spec `deployment`, "Images
# built and published by CI"). Builds the images from docker-compose.prod.yml,
# starts the whole stack on https://localhost with throwaway secrets, checks
# that the API and the web app answer, that Docker reports the API healthy
# (EN-92), that the API can write uploaded
# files and that the backup service writes a dump and an archive of the
# uploaded files (TD-42), that the off-site copy service, unconfigured,
# reports that it is disabled (EN-104), that the documented admin seed
# command creates a system admin who can log in (EN-93), and that a dump taken before the
# newest migration restores, with its uploaded files, and the API then
# applies that migration (EN-105, EN-120), then removes the stack and its
# volumes. CI runs it on every PR and push to main; run it from the
# repository root:
#
#   sh deploy/smoke-test.sh
#
# Ports 80 and 443 must be free. It uses its own Compose project and
# volumes, and a Compose override puts backups in a volume instead of the
# checkout's backups/, so nothing lands next to a real stack's backups
# (EN-119).
set -eu

project=sf-manager-smoke
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

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$env_file" "$override" "$failing_api"
}
trap cleanup EXIT
# dash skips the EXIT trap on a signal, so exit explicitly (Ctrl-C locally).
trap 'exit 130' INT TERM

fail() {
  echo "smoke: $1" >&2
  compose ps -a >&2 || true
  compose logs --tail 40 >&2 || true
  exit 1
}

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

# EN-92: when the API never becomes healthy, the start command must fail
# naming it, and Caddy must stay down instead of answering 502.
compose rm -sf web >/dev/null 2>&1 || fail "could not remove the web container"
if out=$(compose -f "$failing_api" up -d 2>&1); then
  fail "up -d succeeded although the API cannot start"
fi
# Compose names the API as unhealthy (it restarts, unless-stopped) or, in
# other versions, as exited; either way it must name the API.
case $out in
  *"container $project-api-1 is unhealthy"* | *"container $project-api-1 exited"*) ;;
  *) fail "up -d failed without naming the API: $out" ;;
esac
# Created but never started: not running, and not restarting either.
web_state=$(compose ps -a --format '{{.State}}' web) ||
  fail "could not read the web container's state"
case $web_state in
  '' | created) ;;
  *) fail "Caddy is '$web_state' although the API is unhealthy" ;;
esac
echo "smoke: an API that cannot start fails up -d and keeps Caddy down"
