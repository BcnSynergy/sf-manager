#!/bin/sh
# Reset of the public demo (spec `deployment`, "Demo stack"; spec
# `demo-seed-data`). Runs in the `reset` service of docker-compose.demo.yml,
# from the API image, whose working directory is the API (prisma.config.ts,
# dist/seed). That service sets DATABASE_URL, FILE_STORAGE_DIR (through the
# image), SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_DEMO_DATA=true.
#
#   demo-reset.sh          reset now, then every day at DEMO_RESET_HOUR_UTC
#   demo-reset.sh once     reset now and exit
#
# A reset drops and recreates the database schema, applies the migrations,
# empties the uploaded files and seeds the admin and the demo dataset again,
# so every visitor starts from the same data with the same QR codes. The
# API keeps running; requests made during the reset may fail. A failed reset
# is logged and retried at the next scheduled hour instead of stopping the
# service.
set -eu
reset_hour="${DEMO_RESET_HOUR_UTC:-3}"
files_dir="${FILE_STORAGE_DIR:?FILE_STORAGE_DIR is not set}"

check_hour() {
  # A leading zero is rejected too: shell arithmetic would read it as octal.
  case "$reset_hour" in
    [0-9] | 1[0-9] | 2[0-3]) ;;
    *)
      echo "demo-reset: DEMO_RESET_HOUR_UTC must be a whole hour from 0 to 23, got '$reset_hour'" >&2
      exit 1
      ;;
  esac
}

reset_once() {
  echo "demo-reset: dropping the database schema"
  printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n' |
    npx prisma db execute --stdin || return 1
  echo "demo-reset: applying the migrations"
  npx prisma migrate deploy || return 1
  echo "demo-reset: emptying the uploaded files"
  find "$files_dir" -mindepth 1 -delete || return 1
  echo "demo-reset: seeding the demo"
  node dist/seed/src/shared/seeding/demo-seed.main.js || return 1
  echo "demo-reset: done"
}

# Seconds from now until the next DEMO_RESET_HOUR_UTC:00 UTC, at least 1.
seconds_to_next_reset() {
  now=$(date -u +%s)
  next=$(date -u -d "today $reset_hour:00" +%s)
  if [ "$next" -le "$now" ]; then
    next=$(date -u -d "tomorrow $reset_hour:00" +%s)
  fi
  echo $((next - now))
}

check_hour
case "${1:-}" in
  '') ;;
  once)
    reset_once
    exit
    ;;
  *)
    echo "usage: demo-reset.sh [once]" >&2
    exit 1
    ;;
esac

while true; do
  reset_once || echo "demo-reset: reset failed; next try at $reset_hour:00 UTC" >&2
  sleep "$(seconds_to_next_reset)"
done
