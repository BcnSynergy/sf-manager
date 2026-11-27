#!/bin/sh
# Tests for deploy/demo-reset.sh (spec `deployment`, "Demo stack"). Runs the
# script in the API image's base image (GNU date and flock, like the reset
# service), with stub `npx`, `node` and a scratch FILE_STORAGE_DIR, so it
# needs no database and no built image. CI runs it on every PR and push to
# main; run it from the repository root:
#
#   sh deploy/test-demo-reset.sh [SCRIPT]
#
# SCRIPT defaults to deploy/demo-reset.sh; passing a modified copy shows
# which case catches a change.
set -eu

script="${1:-deploy/demo-reset.sh}"
# The API image's base image, so the script meets the same date and flock.
image=$(sed -n 's/^FROM \(node:[^ ]*\) AS base$/\1/p' apps/api/Dockerfile)
[ -n "$image" ] || {
  echo "test-demo-reset: no base image in apps/api/Dockerfile" >&2
  exit 1
}
# Git Bash on Windows would rewrite the container paths below.
export MSYS_NO_PATHCONV=1
p="sfm-demo-reset-test-$$"

cleanup() {
  docker rm -f "$p" >/dev/null 2>&1 || true
  docker volume rm "$p" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

fail() {
  echo "test-demo-reset: FAIL: $1" >&2
  [ -z "${out:-}" ] || printf '%s\n' "--- last output:" "$out" >&2
  exit 1
}
pass() {
  echo "test-demo-reset: ok: $1"
  out=''
}

# The script and its stubs in a volume: `npx` and `node` log each call to
# /work/calls, sleep STUB_SLEEP seconds, and fail while /work/fail-left
# holds a number above 0 (each failure counts it down).
docker volume create "$p" >/dev/null
docker run --rm -i -v "$p:/work" --entrypoint sh "$image" -c '
  mkdir -p /work/bin /work/files &&
  cat >/work/demo-reset.sh &&
  for cmd in npx node; do
    cat >"/work/bin/$cmd" <<EOF
#!/bin/sh
echo "\$(date +%s.%N) start $cmd \$*" >>/work/calls
sleep "\${STUB_SLEEP:-0}"
left=\$(cat /work/fail-left 2>/dev/null || echo 0)
if [ "\$left" -gt 0 ]; then
  echo \$((left - 1)) >/work/fail-left
  echo "\$(date +%s.%N) fail $cmd" >>/work/calls
  exit 1
fi
echo "\$(date +%s.%N) end $cmd" >>/work/calls
EOF
    chmod +x "/work/bin/$cmd"
  done' <"$script"

# Runs the script; sets $out and $status instead of failing. Bounded inside
# the container, so a loop that should have stopped exits 124 instead of
# hanging the test. run_with adds docker -e options (its first argument) for
# that one call only.
run_with() {
  RUN_ENV=$1
  shift
  run "$@"
  RUN_ENV=''
}
run() {
  status=0
  # shellcheck disable=SC2086 # RUN_ENV is one option per word
  out=$(docker run --rm -v "$p:/work" -w /work -e PATH=/work/bin:/usr/local/bin:/usr/bin:/bin \
    -e FILE_STORAGE_DIR=/work/files ${RUN_ENV:-} --entrypoint timeout "$image" \
    60 sh /work/demo-reset.sh "$@" 2>&1) || status=$?
}
work() {
  docker run --rm -v "$p:/work" --entrypoint sh "$image" -c "$1"
}

# The schedule: the next DEMO_RESET_HOUR_UTC:00 UTC, never 0 seconds away.
# 1970-01-01 02:00, 03:00, 03:00:01 and 23:30 UTC against the 03:00 default.
for case in 7200:3600 10800:86400 10801:86399 84600:12600; do
  now=${case%:*}
  expected=${case#*:}
  run seconds-to-next "$now"
  if [ "$status" != 0 ] || [ "$out" != "$expected" ]; then
    fail "seconds-to-next $now printed '$out' (exit $status), expected $expected"
  fi
done
run_with '-e DEMO_RESET_HOUR_UTC=0' seconds-to-next 0
[ "$out" = 86400 ] || fail "hour 0 at midnight printed '$out', expected 86400"
pass "the next reset is the next whole reset hour in UTC"

for hour in 24 03 x; do
  run_with "-e DEMO_RESET_HOUR_UTC=$hour" seconds-to-next 0
  case "$status:$out" in
    1:*"DEMO_RESET_HOUR_UTC must be a whole hour"*) ;;
    *) fail "DEMO_RESET_HOUR_UTC='$hour' was not refused" ;;
  esac
done
for retry in 0 010 -5 x; do
  run_with "-e DEMO_RESET_RETRY_SECONDS=$retry" seconds-to-next 0
  case "$status:$out" in
    1:*"DEMO_RESET_RETRY_SECONDS must be"*) ;;
    *) fail "DEMO_RESET_RETRY_SECONDS='$retry' was not refused" ;;
  esac
done
run seconds-to-next yesterday
case "$status:$out" in
  1:*"NOW must be epoch seconds"*) ;;
  *) fail "a NOW that is not epoch seconds was not refused as such" ;;
esac
# Without FILE_STORAGE_DIR both the loop and once stop before any step,
# instead of retrying a reset that can never succeed.
work 'rm -f /work/calls'
for mode in once ''; do
  # shellcheck disable=SC2086 # an empty mode runs the loop
  run_with '-e FILE_STORAGE_DIR=' $mode
  case "$status:$out" in
    1:*"FILE_STORAGE_DIR is not set"*) ;;
    *) fail "'demo-reset.sh $mode' without FILE_STORAGE_DIR did not stop at once" ;;
  esac
done
[ -z "$(work 'cat /work/calls 2>/dev/null')" ] ||
  fail "a reset step ran without FILE_STORAGE_DIR"
pass "bad settings are refused"

# once: every step in order, the uploaded files emptied.
work 'rm -f /work/calls && touch /work/files/logo.svg && mkdir -p /work/files/signatures && touch /work/files/signatures/a.png'
run once
[ "$status" = 0 ] || fail "once exited $status"
steps=$(work "sed -n 's/^[0-9.]* start //p' /work/calls" | tr '\n' '|')
[ "$steps" = 'npx prisma db execute --stdin|npx prisma migrate deploy|node dist/seed/src/shared/seeding/demo-seed.main.js|' ] ||
  fail "once ran '$steps'"
[ -z "$(work 'ls -A /work/files')" ] || fail "once left uploaded files behind"
case $out in *"demo-reset: done"*) ;; *) fail "once did not report done" ;; esac
pass "once drops, migrates, empties the files and seeds, in that order"

# A failed step fails once and stops the reset.
work 'rm -f /work/calls && echo 1 >/work/fail-left'
run once
[ "$status" != 0 ] || fail "once succeeded although its first step failed"
[ "$(work 'grep -c " start " /work/calls')" = 1 ] || fail "once went on after a failed step"
pass "a failed step fails the reset and runs no further step"

# Two resets never overlap: a second once waits for the first.
work 'rm -f /work/calls /work/fail-left'
# Bounded like run: a lock that is never released fails the case instead of
# hanging it. Each reset is waited for by its own PID, so the container's
# exit status is non-zero when either of them fails (a bare `wait` is 0);
# both are always waited for, so both logs are complete.
# shellcheck disable=SC2016 # expanded in the container
docker run -d --name "$p" -v "$p:/work" -w /work -e PATH=/work/bin:/usr/local/bin:/usr/bin:/bin \
  -e FILE_STORAGE_DIR=/work/files -e STUB_SLEEP=1 --entrypoint timeout "$image" \
  60 sh -c 'sh /work/demo-reset.sh once & a=$!; sh /work/demo-reset.sh once & b=$!
    wait "$a"; sa=$?; wait "$b"; sb=$?; [ "$sa" = 0 ] && [ "$sb" = 0 ]' >/dev/null
waited=$(docker wait "$p")
out=$(docker logs "$p" 2>&1)
docker rm "$p" >/dev/null
[ "$waited" = 0 ] || fail "the two concurrent resets exited $waited"
# Each call logs its start and its end; the six calls strictly alternate
# start and end, so no call ever ran while another did.
order=$(work "sort -n /work/calls | sed 's/^[0-9.]* //; s/ .*//'" | tr '\n' ' ')
[ "$order" = 'start end start end start end start end start end start end ' ] ||
  fail "two concurrent resets interleaved: $order"
case $out in
  *"demo-reset: waiting for the reset already running"*) ;;
  *) fail "the second reset did not say it was waiting for the first" ;;
esac
pass "a second reset waits for the first, and says so"

# The service loop retries a failed reset after DEMO_RESET_RETRY_SECONDS
# instead of waiting for the next night.
work 'rm -f /work/calls && echo 1 >/work/fail-left'
docker run -d --name "$p" -v "$p:/work" -w /work -e PATH=/work/bin:/usr/local/bin:/usr/bin:/bin \
  -e FILE_STORAGE_DIR=/work/files -e DEMO_RESET_RETRY_SECONDS=1 --entrypoint sh "$image" \
  /work/demo-reset.sh >/dev/null
i=0
while [ "$i" -lt 30 ]; do
  i=$((i + 1))
  out=$(docker logs "$p" 2>&1)
  case $out in *"demo-reset: done"*) break ;; esac
  sleep 1
done
case $out in
  *"trying again in 1 seconds"*"demo-reset: done"*) ;;
  *) fail "the loop did not retry a failed reset and then succeed" ;;
esac
[ "$(docker inspect -f '{{.State.Running}}' "$p")" = true ] ||
  fail "the loop stopped after a successful reset"
pass "the loop retries a failed reset and keeps running"
