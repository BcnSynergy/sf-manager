#!/bin/sh
# Database and uploaded-file backups for the production stack (TD-41, TD-42;
# spec `deployment`, "Database backups"). Runs in the `backup` service of
# docker-compose.prod.yml, which sets the libpq PG* variables, mounts the
# host's ./backups at /backups and the api-files volume at /files.
#
#   postgres-backup.sh                back up now, then every 24 hours
#   postgres-backup.sh once           back up now and exit
#   postgres-backup.sh restore FILE   replace the database with a dump, and
#                                     the uploaded files with its archive
#
# Each backup is a dump, sfmanager-<stamp>.dump, then an archive of the
# uploaded files, sfmanager-<stamp>.files.tar.gz, with the same stamp. The
# dump goes first: a logo changed between the two can leave the restored
# profile pointing at a file the archive lacks, which reads as no logo.
#
# restore drops and recreates the database before pg_restore, so a dump
# taken on an older version restores cleanly and the API applies the newer
# migrations when it starts again. It then replaces the uploaded files with
# the archive of the same stamp; a dump without one (taken before TD-42, or
# whose archiving failed) restores the database only and says so. A FILE that
# is not a dump, or an archive that cannot be read, stops the restore before
# anything changes; an archive that cannot be extracted (a full disk) leaves
# the uploaded files as they were. Stop the API first. FILE is a name in /backups or an
# absolute path.
#
# Each file is written under a temporary name and renamed when complete, so
# a failed or interrupted backup never leaves a file that looks like one.
# Backups older than BACKUP_RETENTION_DAYS are deleted after each successful
# backup; a failed archive skips that, so old backups stay while it is
# broken. Copying them off the server is the operator's job (README
# "Database backups").
set -eu

# Dumps hold password hashes and personal data: readable by root only.
umask 077

backup_dir=/backups
files_dir=/files
# Where restore extracts an archive before swapping it in (EN-117).
staging_name=.restore.partial
staging="$files_dir/$staging_name"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

# Only backing up uses the retention, so a bad value never blocks a restore.
check_retention() {
  # A leading zero is rejected too: shell arithmetic would read it as octal.
  case "$retention_days" in
    '' | *[!0-9]* | 0*)
      echo "BACKUP_RETENTION_DAYS must be a positive integer, got \"$retention_days\"" >&2
      exit 1
      ;;
  esac
}

backup_once() {
  # A stop or crash mid-backup leaves its temporary file behind (the shell
  # never reaches the cleanup below), so sweep any older than a day; a
  # younger one may belong to a backup still running.
  find "$backup_dir" -maxdepth 1 -name '.sfmanager-*.partial' \
    -mmin +1440 -delete

  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$backup_dir/sfmanager-$stamp.dump"
  # The PID keeps a manual backup and the loop's apart within the same second.
  partial="$backup_dir/.sfmanager-$stamp-$$.dump.partial"

  if ! pg_dump --format=custom --file="$partial"; then
    rm -f "$partial"
    echo "backup: pg_dump failed, no backup written" >&2
    return 1
  fi
  # The loop calls this with `|| true`, which turns off set -e in here.
  mv "$partial" "$target" || return 1
  echo "backup: wrote $(basename "$target")"

  files_target="$backup_dir/sfmanager-$stamp.files.tar.gz"
  files_partial="$backup_dir/.sfmanager-$stamp-$$.files.tar.gz.partial"
  if ! tar -czf "$files_partial" --exclude="./$staging_name" -C "$files_dir" .; then
    rm -f "$files_partial"
    echo "backup: archiving the uploaded files failed, the dump has none" >&2
    return 1
  fi
  mv "$files_partial" "$files_target" || return 1
  echo "backup: wrote $(basename "$files_target")"

  find "$backup_dir" -maxdepth 1 \
    \( -name 'sfmanager-*.dump' -o -name 'sfmanager-*.files.tar.gz' \) \
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
  # A files archive passed by mistake would otherwise be found out only
  # after the database was dropped.
  if ! pg_restore --list "$file" >/dev/null; then
    echo "backup: $(basename "$file") is not a dump or cannot be read, nothing restored" >&2
    exit 1
  fi
  files_archive="${file%.dump}.files.tar.gz"
  # Checked before anything is dropped, so a broken archive changes nothing.
  if [ -f "$files_archive" ] && ! tar -tzf "$files_archive" >/dev/null; then
    echo "backup: cannot read $(basename "$files_archive"), nothing restored" >&2
    exit 1
  fi

  dropdb --maintenance-db=postgres --force --if-exists "$PGDATABASE"
  if ! createdb --maintenance-db=postgres "$PGDATABASE"; then
    echo "backup: restore failed and $PGDATABASE no longer exists;" \
      "do not start the API, fix the cause and restore again" >&2
    exit 1
  fi
  if ! pg_restore --no-owner --exit-on-error --single-transaction \
    --dbname="$PGDATABASE" "$file"; then
    echo "backup: restore failed and $PGDATABASE is now empty;" \
      "do not start the API, fix the cause and restore again" >&2
    exit 1
  fi
  echo "backup: restored $(basename "$file") into $PGDATABASE"

  if [ ! -f "$files_archive" ]; then
    echo "backup: no $(basename "$files_archive") for this dump, uploaded files left as they are"
    return
  fi
  # Extracted beside the current files first, on the same volume, so a
  # failure such as a full disk leaves them as they were and the swap is
  # only renames. Extracting as root keeps the files' owner, the API's user.
  rm -rf "$staging"
  mkdir "$staging"
  if ! tar -xzf "$files_archive" -C "$staging"; then
    rm -rf "$staging"
    echo "backup: restoring the uploaded files failed, they are left as they" \
      "were; the database is restored, fix the cause and restore again" >&2
    exit 1
  fi
  if ! find "$files_dir" -mindepth 1 -maxdepth 1 ! -name "$staging_name" -exec rm -rf {} + ||
    ! find "$staging" -mindepth 1 -maxdepth 1 -exec mv {} "$files_dir/" \; ||
    ! rmdir "$staging"; then
    echo "backup: swapping in the restored uploaded files failed; the database" \
      "is restored, fix the cause and restore again" >&2
    exit 1
  fi
  echo "backup: restored $(basename "$files_archive") into the uploaded files"
}

case "${1:-}" in
  '') check_retention ;;
  once)
    check_retention
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
  # A failed backup is logged and retried on the next cycle instead of
  # stopping the service.
  backup_once || true
  sleep 86400
done
