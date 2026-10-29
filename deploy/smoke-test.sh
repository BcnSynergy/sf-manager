#!/bin/sh
# Smoke test for the production stack (EN-91; spec `deployment`, "Images
# built and published by CI"). Builds the images from docker-compose.prod.yml,
# starts the whole stack on https://localhost with throwaway secrets, checks
# that the API and the web app answer, that the API can write uploaded
# files and that the backup service writes a dump and an archive of the
# uploaded files (TD-42), then removes the stack and its volumes. CI runs it
# on every PR and push to main; run it from the
# repository root:
#
#   sh deploy/smoke-test.sh
#
# Ports 80 and 443 must be free. It uses its own Compose project and
# volumes, but the backup service's bind mount is the checkout's backups/,
# so its dump and archive land next to a production stack's backups in the
# same checkout.
set -eu

project=sf-manager-smoke
env_file=$(mktemp)
cat >"$env_file" <<EOF
SITE_ADDRESS=localhost
POSTGRES_USER=smoke
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=sfmanager
JWT_SECRET=$(openssl rand -hex 32)
EOF

compose() {
  docker compose -p "$project" -f docker-compose.prod.yml --env-file "$env_file" "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$env_file"
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

# The API applies migrations before it listens, so allow it a while.
health=''
attempt=0
while [ "$attempt" -lt 60 ]; do
  health=$(curl -fsk --max-time 5 https://localhost/api/health 2>/dev/null || true)
  [ "$health" = '{"status":"ok","db":"ok"}' ] && break
  attempt=$((attempt + 1))
  sleep 2
done
[ "$health" = '{"status":"ok","db":"ok"}' ] ||
  fail "/api/health never returned {\"status\":\"ok\",\"db\":\"ok\"} (last: '$health')"
echo "smoke: /api/health ok"

status=$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' https://localhost/) || status=000
[ "$status" = 200 ] || fail "the web app answered $status, expected 200"
echo "smoke: web app 200"

# Uploaded files (the organization logo) go to the api-files volume, so the
# API's user must be able to write there (spec `deployment`, "Persistent
# data and secrets").
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
