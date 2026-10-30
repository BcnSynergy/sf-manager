#!/bin/sh
# Tests for deploy/postgres-backup.sh (EN-105; spec `deployment`, "Database
# backups"). Runs the script in the backup service's image against a
# throwaway Postgres container, with its own network and volumes, and
# removes them afterwards. CI runs it on every PR and push to main; run it
# from the repository root:
#
#   sh deploy/test-postgres-backup.sh [SCRIPT]
#
# SCRIPT defaults to deploy/postgres-backup.sh; passing a modified copy
# shows which case catches a change.
set -eu

script="${1:-deploy/postgres-backup.sh}"
# Same image as the backup service, so a Dependabot bump is tested too.
image=$(sed -n 's/^ *image: *\(postgres:[^ ]*\).*/\1/p' docker-compose.prod.yml | head -n 1)
[ -n "$image" ] || {
  echo "test-postgres-backup: no postgres image in docker-compose.prod.yml" >&2
  exit 1
}
p="sfm-backup-test-$$"
# Git Bash on Windows would rewrite the container paths below.
export MSYS_NO_PATHCONV=1

cleanup() {
  docker rm -f "$p-db" "$p-loop" >/dev/null 2>&1 || true
  docker volume rm "$p-files" "$p-backups" "$p-script" >/dev/null 2>&1 || true
  docker network rm "$p" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# dash skips the EXIT trap on a signal, so exit explicitly (Ctrl-C locally).
trap 'exit 130' INT TERM

fail() {
  echo "test-postgres-backup: FAIL: $1" >&2
  [ -z "${out:-}" ] || printf '%s\n' "--- last output:" "$out" >&2
  exit 1
}
# Clears $out, so a later failure never shows an unrelated run's output.
pass() {
  echo "test-postgres-backup: ok: $1"
  out=''
}

# Runs a command in the backup service's image, with its PG* variables and
# mounts. pghost, retention and files_at override PGHOST,
# BACKUP_RETENTION_DAYS and where the files volume is mounted, per call.
run() {
  docker run --rm -i --network "$p" \
    -e PGHOST="${pghost:-$p-db}" -e PGUSER=u -e PGPASSWORD=p \
    -e PGDATABASE=sfmanager -e BACKUP_RETENTION_DAYS="${retention:-14}" \
    -v "$p-backups:/backups" -v "$p-files:${files_at:-/files}" -v "$p-script:/s:ro" \
    --entrypoint /bin/sh "$image" "$@"
}
# Runs the script under test; sets $out and $status instead of failing.
backup() {
  status=0
  out=$(run /s/postgres-backup.sh "$@" 2>&1) || status=$?
}
sql() { docker exec "$p-db" psql -U u -d sfmanager -tAc "$1"; }
db_value() { sql 'select v from t'; }
# Names, owners, modes and contents of the uploaded files.
files_state() {
  run -c 'cd /files && find . -mindepth 1 -exec stat -c "%n %u:%g %a" {} + | sort &&
    find . -type f -exec cat {} + | sort'
}
backups_list() { run -c 'ls -A /backups | sort'; }
expect_out() {
  printf '%s' "$out" | grep -q -- "$1" || fail "$2: output lacks \"$1\""
}

docker network create "$p" >/dev/null
docker volume create "$p-files" >/dev/null
docker volume create "$p-backups" >/dev/null
docker volume create "$p-script" >/dev/null
# Through stdin, so no host path is mounted (Docker Desktop and Git Bash
# disagree on those).
docker run --rm -i -v "$p-script:/s" --entrypoint /bin/sh "$image" \
  -c 'cat >/s/postgres-backup.sh' <"$script"
docker run -d --name "$p-db" --network "$p" -e POSTGRES_USER=u \
  -e POSTGRES_PASSWORD=p -e POSTGRES_DB=sfmanager "$image" >/dev/null
attempt=0
until docker exec "$p-db" pg_isready -U u -d sfmanager -h localhost >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || fail "Postgres did not start"
  sleep 1
done
sql "create table t (v text); insert into t values ('before')" >/dev/null
# The API's user (node, 1000) owns the uploaded files.
run -c 'mkdir /files/logos && echo logo-a >/files/logos/a.png &&
  chown -R 1000:1000 /files/logos && chmod 755 /files/logos &&
  chmod 644 /files/logos/a.png'
files_before=$(files_state)

# --- Backup writes a dump and an archive with the same stamp, root only.
backup once
[ "$status" = 0 ] || fail "backup once exited $status"
dump=$(run -c 'cd /backups && ls sfmanager-*.dump')
stamp=${dump#sfmanager-}
stamp=${stamp%.dump}
archive="sfmanager-$stamp.files.tar.gz"
[ "$(backups_list)" = "$(printf '%s\n' "$dump" "$archive")" ] ||
  fail "backup once: expected only $dump and $archive, got: $(backups_list)"
expect_out "backup: wrote $dump" "backup once"
expect_out "backup: wrote $archive" "backup once"
modes=$(run -c "stat -c %a /backups/$dump /backups/$archive")
[ "$modes" = "$(printf '600\n600')" ] || fail "backup once: modes are $modes, expected 600"
pass "backup writes a dump and a files archive with the same stamp, mode 600"

# --- Restore replaces the database and the uploaded files.
sql "update t set v = 'after'" >/dev/null
run -c 'rm /files/logos/a.png && echo logo-b >/files/logos/b.png'
backup restore "$dump"
[ "$status" = 0 ] || fail "restore exited $status"
[ "$(db_value)" = before ] || fail "restore: database holds '$(db_value)', expected 'before'"
[ "$(files_state)" = "$files_before" ] ||
  fail "restore: uploaded files are $(files_state), expected $files_before"
expect_out "backup: restored $archive into the uploaded files" "restore"
pass "restore replaces the database and the uploaded files, keeping owner and modes"

# --- A file that is not a dump changes nothing.
sql "update t set v = 'untouched'" >/dev/null
run -c 'echo logo-c >/files/logos/c.png'
files_changed=$(files_state)
backup restore "$archive"
[ "$status" = 1 ] || fail "restore of the archive exited $status, expected 1"
expect_out "is not a dump or cannot be read, nothing restored" "restore of the archive"
[ "$(db_value)" = untouched ] || fail "restore of the archive changed the database"
[ "$(files_state)" = "$files_changed" ] || fail "restore of the archive changed the uploaded files"
pass "restoring a file that is not a dump fails before changing anything"

# --- An unreadable files archive changes nothing.
run -c "echo junk >/backups/$archive" ||
  fail "could not damage the archive"
backup restore "$dump"
[ "$status" = 1 ] || fail "restore with a damaged archive exited $status, expected 1"
expect_out "cannot read $archive, nothing restored" "restore with a damaged archive"
[ "$(db_value)" = untouched ] || fail "restore with a damaged archive changed the database"
[ "$(files_state)" = "$files_changed" ] ||
  fail "restore with a damaged archive changed the uploaded files"
pass "an unreadable files archive stops the restore before changing anything"

# --- A dump without an archive restores the database only.
run -c "rm /backups/$archive"
backup restore "$dump"
[ "$status" = 0 ] || fail "restore without an archive exited $status"
expect_out "no $archive for this dump, uploaded files left as they are" "restore without an archive"
[ "$(db_value)" = before ] || fail "restore without an archive did not restore the database"
[ "$(files_state)" = "$files_changed" ] || fail "restore without an archive changed the uploaded files"
pass "a dump without an archive restores the database only and says so"

# --- A missing dump and a bad command fail.
backup restore sfmanager-19700101T000000Z.dump
[ "$status" = 1 ] || fail "restore of a missing dump exited $status, expected 1"
expect_out "no such dump" "restore of a missing dump"
backup bogus
[ "$status" = 1 ] || fail "bogus exited $status, expected 1"
expect_out "usage: postgres-backup.sh" "bogus"
pass "a missing dump or an unknown command fails with a message"

# --- Retention deletes old backups and stale partial files only.
# With BACKUP_RETENTION_DAYS=1, a backup 2 days old goes and one 12 hours
# old stays, so the cutoff must follow the setting.
# shellcheck disable=SC2016 # expanded in the container
run -c 'cd /backups && rm -f sfmanager-* &&
  for f in sfmanager-20200101T000000Z.dump sfmanager-20200101T000000Z.files.tar.gz \
    .sfmanager-20200101T000000Z-7.dump.partial other.txt; do
    echo old >"$f" && touch -d "2020-01-01 00:00:00" "$f"; done &&
  now=$(date +%s) &&
  echo old >sfmanager-20210101T000000Z.dump &&
  touch -d "@$((now - 2 * 86400))" sfmanager-20210101T000000Z.dump &&
  echo recent >sfmanager-20220101T000000Z.dump &&
  touch -d "@$((now - 43200))" sfmanager-20220101T000000Z.dump'
retention=1
backup once
retention=''
[ "$status" = 0 ] || fail "backup with retention exited $status"
expect_out "backup: deleted sfmanager-20200101T000000Z.dump" "retention"
expect_out "backup: deleted sfmanager-20200101T000000Z.files.tar.gz" "retention"
expect_out "backup: deleted sfmanager-20210101T000000Z.dump" "retention"
left=$(backups_list)
printf '%s\n' "$left" | grep -q -e 2020 -e 2021 && fail "retention left $left"
printf '%s\n' "$left" | grep -qx other.txt || fail "retention deleted other.txt"
printf '%s\n' "$left" | grep -qx sfmanager-20220101T000000Z.dump ||
  fail "retention deleted a backup younger than BACKUP_RETENTION_DAYS"
[ "$(printf '%s\n' "$left" | grep -c '^sfmanager-')" = 3 ] ||
  fail "retention: expected the new dump and archive and the recent dump, got $left"
pass "retention deletes backups older than BACKUP_RETENTION_DAYS and stale partial files only"

# --- A bad BACKUP_RETENTION_DAYS writes nothing.
before=$(backups_list)
for value in 0 07 x -1; do
  retention=$value
  backup once
  [ "$status" = 1 ] || fail "BACKUP_RETENTION_DAYS=$value exited $status, expected 1"
  expect_out "BACKUP_RETENTION_DAYS must be a positive integer" "BACKUP_RETENTION_DAYS=$value"
done
# The service itself (no argument) must fail too, not start its loop; the
# timeout turns a loop that started into a failure instead of a hang. The
# trailing command keeps sh from exec'ing it: as PID 1 the script would
# ignore the timeout's SIGTERM.
retention=x
status=0
# shellcheck disable=SC2016 # expanded in the container
out=$(run -c 'timeout 30 sh /s/postgres-backup.sh; exit $?' 2>&1) || status=$?
[ "$status" = 1 ] || fail "the service with BACKUP_RETENTION_DAYS=x exited $status, expected 1"
expect_out "BACKUP_RETENTION_DAYS must be a positive integer" "the service with BACKUP_RETENTION_DAYS=x"
[ "$(backups_list)" = "$before" ] || fail "a bad BACKUP_RETENTION_DAYS wrote a backup"
retention=''
pass "a bad BACKUP_RETENTION_DAYS fails without writing a dump"

# --- A failed pg_dump writes nothing and deletes nothing.
run -c 'touch -d "2020-01-01 00:00:00" /backups/sfmanager-*'
before=$(backups_list)
pghost="$p-nowhere" retention=1
backup once
pghost='' retention=''
[ "$status" = 1 ] || fail "backup with an unreachable database exited $status, expected 1"
expect_out "backup: pg_dump failed, no backup written" "unreachable database"
[ "$(backups_list)" = "$before" ] || fail "a failed pg_dump changed backups/: $(backups_list)"
pass "a failed pg_dump writes no dump and deletes no old backup"

# --- The service logs a failed backup and keeps running.
docker run -d --name "$p-loop" --network "$p" -e PGHOST="$p-nowhere" -e PGUSER=u \
  -e PGPASSWORD=p -e PGDATABASE=sfmanager -v "$p-backups:/backups" \
  -v "$p-files:/files" -v "$p-script:/s:ro" --entrypoint /bin/sh "$image" \
  /s/postgres-backup.sh >/dev/null
attempt=0
until docker logs "$p-loop" 2>&1 | grep -q 'backup: pg_dump failed'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || fail "the service did not log the failed backup"
  sleep 1
done
sleep 2
[ "$(docker inspect -f '{{.State.Running}}' "$p-loop")" = true ] ||
  fail "the service stopped after a failed backup"
docker rm -f "$p-loop" >/dev/null
pass "the service logs a failed backup and keeps running"

# --- A failed archive keeps the dump and skips the retention.
# With the files volume mounted elsewhere, /files does not exist.
files_at=/elsewhere retention=1
backup once
files_at='' retention=''
[ "$status" = 1 ] || fail "backup without /files exited $status, expected 1"
expect_out "archiving the uploaded files failed, the dump has none" "backup without /files"
left=$(backups_list)
for f in $before; do
  printf '%s\n' "$left" | grep -qx "$f" || fail "a failed archive deleted $f"
done
[ "$(printf '%s\n' "$left" | grep -c '\.dump$')" = $(($(printf '%s\n' "$before" | grep -c '\.dump$') + 1)) ] ||
  fail "a failed archive did not keep the dump: $left"
printf '%s\n' "$left" | grep -q partial && fail "a failed archive left a partial file: $left"
pass "a failed archive keeps the dump, deletes no old backup and leaves no partial file"

echo "test-postgres-backup: all passed"
