#!/bin/sh
# Smoke test for the production stack (EN-91; spec `deployment`, "Images
# built and published by CI"). Builds the images from docker-compose.prod.yml,
# starts the whole stack on https://localhost with throwaway secrets, checks
# that the web app and the API answer, then removes the stack and its
# volumes. CI runs it on every PR and push to main; run it from the
# repository root:
#
#   sh deploy/smoke-test.sh
#
# Ports 80 and 443 must be free. It uses its own Compose project, so it
# never touches a dev or production stack on the same machine.
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

fail() {
  echo "smoke: $1" >&2
  compose ps -a >&2 || true
  compose logs --tail 40 >&2 || true
  exit 1
}

compose up -d --build

# The API applies migrations before it listens, so allow it a while.
health=''
attempt=0
while [ "$attempt" -lt 60 ]; do
  health=$(curl -fsk https://localhost/api/health 2>/dev/null || true)
  [ "$health" = '{"status":"ok","db":"ok"}' ] && break
  attempt=$((attempt + 1))
  sleep 2
done
[ "$health" = '{"status":"ok","db":"ok"}' ] ||
  fail "/api/health never returned {\"status\":\"ok\",\"db\":\"ok\"} (last: '$health')"
echo "smoke: /api/health ok"

status=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/)
[ "$status" = 200 ] || fail "the web app answered $status, expected 200"
echo "smoke: web app 200"

compose logs backup | grep -q 'backup: wrote ' ||
  fail "the backup service wrote no dump"
echo "smoke: backup service wrote a dump"
