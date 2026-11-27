#!/bin/sh
# Reset of the public demo (spec `deployment`, "Demo stack"; spec
# `demo-seed-data`). Runs in the `reset` service of docker-compose.demo.yml,
# from the API image, whose working directory is the API (prisma.config.ts,
# dist/seed). That service sets DATABASE_URL, FILE_STORAGE_DIR (through the
# image), SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_DEMO_DATA=true.
#
#   demo-reset.sh                   reset now, then every day at
#                                   DEMO_RESET_HOUR_UTC
#   demo-reset.sh once              reset now and exit
#   demo-reset.sh seconds-to-next [NOW]
#                                   print the seconds from NOW (epoch
#                                   seconds, default the current time) to
#                                   the next reset (deploy/test-demo-reset.sh)
#
# A reset drops and recreates the database schema, applies the migrations,
# empties the uploaded files and seeds the admin and the demo dataset again,
# so every visitor starts from the same data with the same QR codes. The
# API keeps running; requests made during the reset may fail. Resets never
# overlap: a second one (`once` during the scheduled one) waits for the
# first. The lock is a file in the container, so run `once` inside the
# running reset container (`docker compose exec reset`), never in a new one
# (`docker compose run`). A failed reset is logged and retried every
# DEMO_RESET_RETRY_SECONDS (default 900) until one succeeds, instead of
# leaving the demo broken until the next night or stopping the service. A
# missing or invalid setting stops it at once instead.
set -eu
reset_hour="${DEMO_RESET_HOUR_UTC:-3}"
retry_seconds="${DEMO_RESET_RETRY_SECONDS:-900}"
lock_file=/tmp/demo-reset.lock

check_settings() {
  # A leading zero is rejected too: shell arithmetic would read it as octal.
  case "$reset_hour" in
    [0-9] | 1[0-9] | 2[0-3]) ;;
    *)
      echo "demo-reset: DEMO_RESET_HOUR_UTC must be a whole hour from 0 to 23, got '$reset_hour'" >&2
      exit 1
      ;;
  esac
  case "$retry_seconds" in
    '' | 0 | 0* | *[!0-9]*)
      echo "demo-reset: DEMO_RESET_RETRY_SECONDS must be a whole number of seconds above 0, got '$retry_seconds'" >&2
      exit 1
      ;;
  esac
}

# Resetting needs the uploaded files' directory; a missing one is a
# configuration error, so it stops the script before the first reset.
check_files_dir() {
  if [ -z "${FILE_STORAGE_DIR:-}" ]; then
    echo "demo-reset: FILE_STORAGE_DIR is not set" >&2
    exit 1
  fi
}

reset_steps() {
  files_dir="$FILE_STORAGE_DIR"
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

# One reset at a time, through a lock both the loop and `once` take.
reset_once() {
  (
    if ! flock -n 9; then
      echo "demo-reset: waiting for the reset already running"
      flock 9 || exit 1
    fi
    reset_steps
  ) 9>"$lock_file"
}

# Seconds from NOW until the next DEMO_RESET_HOUR_UTC:00 UTC, 1 to 86400.
seconds_to_next_reset() {
  now="${1:-$(date -u +%s)}"
  case "$now" in
    '' | *[!0-9]*)
      echo "demo-reset: NOW must be epoch seconds, got '$now'" >&2
      exit 1
      ;;
  esac
  day=$(date -u -d "@$now" +%Y-%m-%d)
  next=$(date -u -d "$day $reset_hour:00" +%s)
  if [ "$next" -le "$now" ]; then
    next=$((next + 86400))
  fi
  echo $((next - now))
}

check_settings
case "${1:-}" in
  '') check_files_dir ;;
  once)
    check_files_dir
    reset_once
    exit
    ;;
  seconds-to-next)
    seconds_to_next_reset "${2:-}"
    exit
    ;;
  *)
    echo "usage: demo-reset.sh [once | seconds-to-next [NOW]]" >&2
    exit 1
    ;;
esac

while true; do
  if reset_once; then
    sleep "$(seconds_to_next_reset)"
  else
    echo "demo-reset: reset failed; trying again in $retry_seconds seconds" >&2
    sleep "$retry_seconds"
  fi
done
