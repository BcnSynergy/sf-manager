#!/bin/sh
# Tests for deploy/offsite-copy.sh (EN-105; spec `deployment`, "Off-site
# backup copies"). Runs the script in the offsite service's image against a
# throwaway S3 server (`rclone serve s3`), with its own network and volumes,
# and removes them afterwards. CI runs it on every PR and push to main; run
# it from the repository root:
#
#   sh deploy/test-offsite-copy.sh [SCRIPT]
#
# SCRIPT defaults to deploy/offsite-copy.sh; passing a modified copy shows
# which case catches a change.
set -eu

script="${1:-deploy/offsite-copy.sh}"
# Same image as the offsite service, so a Dependabot bump is tested too.
image=$(sed -n 's/^ *image: *\(rclone\/rclone:[^ ]*\).*/\1/p' docker-compose.prod.yml | head -n 1)
[ -n "$image" ] || {
  echo "test-offsite-copy: no rclone image in docker-compose.prod.yml" >&2
  exit 1
}
p="sfm-offsite-test-$$"
bucket=sfm-backups
stamp=20261029T000000Z
# Git Bash on Windows would rewrite the container paths below.
export MSYS_NO_PATHCONV=1

cleanup() {
  docker rm -f "$p-s3" "$p-idle" >/dev/null 2>&1 || true
  docker volume rm "$p-backups" "$p-pulled" "$p-wrong" "$p-script" >/dev/null 2>&1 || true
  docker network rm "$p" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# dash skips the EXIT trap on a signal, so exit explicitly (Ctrl-C locally).
trap 'exit 130' INT TERM

fail() {
  echo "test-offsite-copy: FAIL: $1" >&2
  [ -z "${out:-}" ] || printf '%s\n' "--- last output:" "$out" >&2
  exit 1
}
# Clears $out, so a later failure never shows an unrelated run's output.
pass() {
  echo "test-offsite-copy: ok: $1"
  out=''
}

# Settings of a configured copy; cases change them and restore them.
configure() {
  OFFSITE_S3_ENDPOINT="http://$p-s3:9000"
  OFFSITE_S3_BUCKET=$bucket
  OFFSITE_S3_ACCESS_KEY_ID=minioadmin
  OFFSITE_S3_SECRET_ACCESS_KEY=minioadmin
  OFFSITE_S3_PROVIDER=Rclone
  OFFSITE_ENCRYPTION_PASSWORD=correct-horse
}
unconfigure() {
  OFFSITE_S3_ENDPOINT='' OFFSITE_S3_BUCKET='' OFFSITE_S3_ACCESS_KEY_ID=''
  OFFSITE_S3_SECRET_ACCESS_KEY='' OFFSITE_ENCRYPTION_PASSWORD=''
}
# Runs the script under test with the current settings and the backups
# volume `vol` (default the main one); sets $out and $status. The docker
# options are a function so the idle case can reuse them detached.
offsite_opts() {
  printf '%s\n' --network "$p" -v "${vol:-$p-backups}:/backups" -v "$p-script:/s:ro" \
    -e "OFFSITE_S3_ENDPOINT=$OFFSITE_S3_ENDPOINT" -e "OFFSITE_S3_BUCKET=$OFFSITE_S3_BUCKET" \
    -e "OFFSITE_S3_ACCESS_KEY_ID=$OFFSITE_S3_ACCESS_KEY_ID" \
    -e "OFFSITE_S3_SECRET_ACCESS_KEY=$OFFSITE_S3_SECRET_ACCESS_KEY" \
    -e "OFFSITE_S3_PROVIDER=$OFFSITE_S3_PROVIDER" \
    -e "OFFSITE_ENCRYPTION_PASSWORD=$OFFSITE_ENCRYPTION_PASSWORD" \
    -e "RCLONE_RETRIES=${retries:-3}" -e "RCLONE_LOW_LEVEL_RETRIES=${retries:-10}" \
    -e RCLONE_CONTIMEOUT=5s --entrypoint /bin/sh "$image" /s/offsite-copy.sh
}
offsite() {
  status=0
  # No option or value above holds a newline, so one per line is safe.
  # shellcheck disable=SC2046
  out=$(IFS='
' && docker run --rm $(offsite_opts) "$@" 2>&1) || status=$?
}
# Raw objects in the bucket, as the S3 server stores them.
bucket_list() { docker exec "$p-s3" sh -c "cd /data/$bucket && ls -A | sort"; }
in_volume() { docker run --rm -v "$1:/b" --entrypoint /bin/sh "$image" -c "$2"; }
expect_out() {
  printf '%s' "$out" | grep -q -- "$1" || fail "$2: output lacks \"$1\""
}

docker network create "$p" >/dev/null
for v in backups pulled wrong script; do docker volume create "$p-$v" >/dev/null; done
# Through stdin, so no host path is mounted (Docker Desktop and Git Bash
# disagree on those).
docker run --rm -i -v "$p-script:/s" --entrypoint /bin/sh "$image" \
  -c 'cat >/s/offsite-copy.sh' <"$script"
docker run -d --name "$p-s3" --network "$p" --entrypoint /bin/sh "$image" \
  -c "mkdir -p /data/$bucket && exec rclone serve s3 /data --addr :9000 \
    --auth-key minioadmin,minioadmin" >/dev/null
in_volume "$p-backups" "cd /b && echo PGDMP-secret-data >sfmanager-$stamp.dump &&
  echo TARDATA-secret >sfmanager-$stamp.files.tar.gz &&
  echo partial >.sfmanager-$stamp-7.dump.partial && echo notes >notes.txt &&
  chmod 600 ./*"
configure

# The S3 server needs a moment; a copy of an empty selection probes it.
attempt=0
until docker run --rm --network "$p" -e RCLONE_CONFIG_M_TYPE=s3 \
  -e RCLONE_CONFIG_M_PROVIDER=Rclone -e "RCLONE_CONFIG_M_ENDPOINT=http://$p-s3:9000" \
  -e RCLONE_CONFIG_M_ACCESS_KEY_ID=minioadmin -e RCLONE_CONFIG_M_SECRET_ACCESS_KEY=minioadmin \
  "$image" lsd m: >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || fail "the S3 server did not start"
  sleep 1
done

# --- A copy uploads the complete backups only, encrypted.
offsite once
[ "$status" = 0 ] || fail "once exited $status"
expect_out "offsite: copy complete" "once"
[ "$(bucket_list)" = "$(printf '%s\n' "sfmanager-$stamp.dump.bin" "sfmanager-$stamp.files.tar.gz.bin")" ] ||
  fail "once: the bucket holds $(bucket_list)"
pass "a copy uploads the dump and the files archive, not partial or other files"
docker exec "$p-s3" sh -c "cat /data/$bucket/*" | grep -q -e PGDMP-secret -e TARDATA-secret &&
  fail "the bucket holds plaintext"
pass "the copies are encrypted"

# --- A copy only adds.
dump_size=$(docker exec "$p-s3" stat -c %s "/data/$bucket/sfmanager-$stamp.dump.bin")
in_volume "$p-backups" "rm /b/sfmanager-$stamp.files.tar.gz && echo damaged >/b/sfmanager-$stamp.dump"
offsite once
[ "$status" = 0 ] || fail "once after local changes exited $status"
[ "$(bucket_list)" = "$(printf '%s\n' "sfmanager-$stamp.dump.bin" "sfmanager-$stamp.files.tar.gz.bin")" ] ||
  fail "a deleted local backup was removed from the bucket: $(bucket_list)"
[ "$(docker exec "$p-s3" stat -c %s "/data/$bucket/sfmanager-$stamp.dump.bin")" = "$dump_size" ] ||
  fail "a damaged local backup replaced its copy"
pass "a deleted or damaged local backup neither removes nor replaces its copy"

# --- pull decrypts every copy into backups/, root only.
vol=$p-pulled
offsite pull
vol=''
[ "$status" = 0 ] || fail "pull exited $status"
expect_out "offsite: pulled the copies into backups/" "pull"
pulled=$(in_volume "$p-pulled" "cd /b && for f in \$(ls -A | sort); do
  echo \"\$f \$(stat -c %a \"\$f\") \$(cat \"\$f\")\"; done")
[ "$pulled" = "$(printf '%s\n' "sfmanager-$stamp.dump 600 PGDMP-secret-data" \
  "sfmanager-$stamp.files.tar.gz 600 TARDATA-secret")" ] ||
  fail "pull wrote: $pulled"
pass "pull downloads and decrypts every copy, readable by root only"

# --- pull with a wrong password writes nothing.
OFFSITE_ENCRYPTION_PASSWORD=wrong-horse vol=$p-wrong
offsite pull
configure
vol=''
[ "$status" = 1 ] || fail "pull with a wrong password exited $status, expected 1"
expect_out "offsite: pull failed" "pull with a wrong password"
[ -z "$(in_volume "$p-wrong" 'ls -A /b')" ] || fail "pull with a wrong password wrote files"
pass "pull with a wrong password fails and writes no file"

# --- A failed copy is reported.
OFFSITE_S3_ENDPOINT=http://127.0.0.1:9 retries=1
offsite once
configure
retries=''
[ "$status" = 1 ] || fail "once with an unreachable endpoint exited $status, expected 1"
expect_out "offsite: copy failed, retrying next cycle" "unreachable endpoint"
pass "a failed copy is logged as failed"

# --- Partial settings fail, naming the missing ones.
unconfigure
OFFSITE_S3_BUCKET=$bucket
offsite
[ "$status" = 1 ] || fail "partial settings exited $status, expected 1"
expect_out "set every OFFSITE_\* variable or none; missing: OFFSITE_S3_ENDPOINT OFFSITE_S3_ACCESS_KEY_ID OFFSITE_S3_SECRET_ACCESS_KEY OFFSITE_ENCRYPTION_PASSWORD" "partial settings"
pass "partial settings fail and name the missing variables"

# --- Unconfigured, the service idles; a one-off command fails.
unconfigure
offsite once
[ "$status" = 1 ] || fail "once unconfigured exited $status, expected 1"
expect_out "off-site copy is not configured" "once unconfigured"
# shellcheck disable=SC2046
(IFS='
' && docker run -d --name "$p-idle" $(offsite_opts)) >/dev/null
attempt=0
until docker logs "$p-idle" 2>&1 | grep -q 'offsite: off-site copy disabled'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 15 ] || fail "the unconfigured service did not report that it is disabled"
  sleep 1
done
sleep 2
[ "$(docker inspect -f '{{.State.Running}}' "$p-idle")" = true ] ||
  fail "the unconfigured service stopped"
pass "unconfigured, the service says it is disabled and keeps running"

# --- An unknown command fails.
offsite bogus
[ "$status" = 1 ] || fail "bogus exited $status, expected 1"
expect_out "usage: offsite-copy.sh" "bogus"
pass "an unknown command fails with the usage"

echo "test-offsite-copy: all passed"
