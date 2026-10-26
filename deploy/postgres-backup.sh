#!/bin/sh
# Database backups for the production stack (TD-41; spec `deployment`,
# "Database backups"). Runs in the `backup` service of
# docker-compose.prod.yml, which sets the libpq PG* variables and mounts the
# host's ./backups at /backups.
#
#   postgres-backup.sh                dump now, then every 24 hours
#   postgres-backup.sh once           dump now and exit
#   postgres-backup.sh restore FILE   replace the database with a dump
#
# restore drops and recreates the database before pg_restore, so a dump
# taken on an older version restores cleanly and the API applies the newer
# migrations when it starts again. Stop the API first. FILE is a name in
# /backups or an absolute path.
#
# Each dump is written under a temporary name and renamed when complete, so
# a failed or interrupted pg_dump never leaves a file that looks like a
# backup. Dumps older than BACKUP_RETENTION_DAYS are deleted after each
# successful dump. Copying them off the server is the operator's job
# (README "Database backups").
set -eu

# Dumps hold password hashes and personal data: readable by root only.
umask 077

backup_dir=/backups
retention_days="${BACKUP_RETENTION_DAYS:-14}"

# A leading zero is rejected too: shell arithmetic would read it as octal.
case "$retention_days" in
  '' | *[!0-9]* | 0*)
    echo "BACKUP_RETENTION_DAYS must be a positive integer, got \"$retention_days\"" >&2
    exit 1
    ;;
esac

backup_once() {
  # A stop or crash mid-dump leaves its temporary file behind (the shell
  # never reaches the cleanup below), so sweep any older than a day; a
  # younger one may belong to a dump still running.
  find "$backup_dir" -maxdepth 1 -name '.sfmanager-*.dump.partial' \
    -mmin +1440 -delete

  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$backup_dir/sfmanager-$stamp.dump"
  partial="$backup_dir/.sfmanager-$stamp.dump.partial"

  if ! pg_dump --format=custom --file="$partial"; then
    rm -f "$partial"
    echo "backup: pg_dump failed, no backup written" >&2
    return 1
  fi
  # The loop calls this with `|| true`, which turns off set -e in here.
  mv "$partial" "$target" || return 1
  echo "backup: wrote $(basename "$target")"

  find "$backup_dir" -maxdepth 1 -name 'sfmanager-*.dump' \
    -mmin +$((retention_days * 1440)) -print -delete |
    sed 's|.*/|backup: deleted |'
}

restore() {
  case "$1" in
    /*) file="$1" ;;
    *) file="$backup_dir/$1" ;;
  esac
  if [ ! -f "$file" ]; then
    echo "backup: no such dump: $file" >&2
    exit 1
  fi

  dropdb --maintenance-db=postgres --force --if-exists "$PGDATABASE"
  createdb --maintenance-db=postgres "$PGDATABASE"
  if ! pg_restore --no-owner --exit-on-error --single-transaction \
    --dbname="$PGDATABASE" "$file"; then
    echo "backup: restore failed and $PGDATABASE is now empty;" \
      "do not start the API, fix the cause and restore again" >&2
    exit 1
  fi
  echo "backup: restored $(basename "$file") into $PGDATABASE"
}

case "${1:-}" in
  '') ;;
  once)
    backup_once
    exit
    ;;
  restore)
    if [ $# -ne 2 ]; then
      echo "usage: postgres-backup.sh restore FILE" >&2
      exit 1
    fi
    restore "$2"
    exit
    ;;
  *)
    echo "usage: postgres-backup.sh [once | restore FILE]" >&2
    exit 1
    ;;
esac

while true; do
  # A failed dump is logged and retried on the next cycle instead of
  # stopping the service.
  backup_once || true
  sleep 86400
done
