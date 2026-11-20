#!/bin/sh
# Tests for deploy/deploy.sh and deploy/resolve-commit.sh (EN-185; spec
# `deployment`, "Deploy from CI"). Builds a throwaway origin repository and
# a checkout of it, and puts a fake `docker` first on PATH that records its
# arguments, so no container or server is involved. CI runs it on every PR
# and push to main; run it from the repository root:
#
#   sh deploy/test-deploy.sh [SCRIPT [RESOLVE]]
#
# SCRIPT and RESOLVE default to deploy/deploy.sh and
# deploy/resolve-commit.sh; passing a modified copy shows which case catches
# a change.
set -eu

abs() { echo "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; }
# The image tag form of deploy/deploy.sh: the first 7 characters of a SHA.
short() { printf %s "$1" | cut -c1-7; }
script=$(abs "${1:-deploy/deploy.sh}")
resolve=$(abs "${2:-deploy/resolve-commit.sh}")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT TERM

failures=0
fail() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}

git_q() {
  git -c init.defaultBranch=main -c core.autocrlf=false -c user.name=test \
    -c user.email=test@example.invalid "$@"
}

# Origin with two commits on main and one on another branch.
git_q init -q "$work/origin"
commit() {
  echo "$2" >"$work/origin/file"
  git_q -C "$work/origin" add file
  git_q -C "$work/origin" commit -q -m "$2"
  git -C "$work/origin" rev-parse HEAD >"$work/$1"
}
commit first one
commit second two
git_q -C "$work/origin" checkout -q -b side
commit side three
git_q -C "$work/origin" checkout -q main
first=$(cat "$work/first")
second=$(cat "$work/second")
side=$(cat "$work/side")

# Fake docker: records each call with the IMAGE_TAG it sees in its
# environment; FAKE_DOCKER_FAIL=pull|up makes that subcommand fail.
# pull-locked also locks the checkout's index (the deploy runs in the
# checkout), so restoring the previous commit fails too; pull-term sends
# TERM to the deploy script, as a dropped SSH session would.
mkdir "$work/bin"
cat >"$work/bin/docker" <<'EOF'
#!/bin/sh
echo "[${IMAGE_TAG:-}] $*" >>"$FAKE_DOCKER_LOG"
case " $* " in
  *" pull "*)
    case "${FAKE_DOCKER_FAIL:-}" in
      pull) exit 1 ;;
      pull-locked) touch .git/index.lock && exit 1 ;;
      pull-term) kill -TERM "$PPID" ;;
    esac
    ;;
  *" up "*) [ "${FAKE_DOCKER_FAIL:-}" != up ] ;;
esac
EOF
chmod +x "$work/bin/docker"

# Fresh checkout before each case: at $first, with a prod.env whose
# IMAGE_TAG is $baseline_tag. "Unchanged" below means still at these values.
baseline_tag=sha-0000000
reset() {
  rm -rf "$work/checkout" "$work/docker.log"
  git clone -q "$work/origin" "$work/checkout"
  git -C "$work/checkout" checkout -q --detach "$first"
  printf 'POSTGRES_PASSWORD=secret\nIMAGE_TAG=%s\nSITE_ADDRESS=example.test\n' \
    "$baseline_tag" >"$work/checkout/prod.env"
  : >"$work/docker.log"
}

# run INPUT [FAIL]: runs the script as the forced command would.
run() {
  (
    export SSH_ORIGINAL_COMMAND="$1" SFM_DEPLOY_DIR="$work/checkout" \
      FAKE_DOCKER_LOG="$work/docker.log" FAKE_DOCKER_FAIL="${2:-}" \
      PATH="$work/bin:$PATH"
    unset IMAGE_TAG
    sh "$script"
  ) >"$work/out" 2>&1
}

# docker_calls_are TAG NAME: the deploy pulled TAG's images, then started
# the stack from prod.env alone.
docker_calls_are() {
  expected="[$1] compose -f docker-compose.prod.yml --env-file prod.env pull api web
[] compose -f docker-compose.prod.yml --env-file prod.env up -d --no-build"
  [ "$(cat "$work/docker.log")" = "$expected" ] ||
    fail "$2: docker calls were: $(cat "$work/docker.log")"
}

head_is() { [ "$(git -C "$work/checkout" rev-parse HEAD)" = "$1" ]; }
tag_is() { grep -qx "IMAGE_TAG=$1" "$work/checkout/prod.env"; }

# refused NAME INPUT MESSAGE: the script fails with MESSAGE and changes
# nothing.
refused() {
  reset
  if run "$2"; then fail "$1: exit 0"; fi
  grep -q "$3" "$work/out" || fail "$1: no '$3' in: $(cat "$work/out")"
  [ -s "$work/docker.log" ] && fail "$1: docker was called"
  head_is "$first" || fail "$1: checkout moved"
  tag_is "$baseline_tag" || fail "$1: prod.env changed"
  return 0
}

full='expected a full 40-character commit SHA'
refused 'empty input' '' "$full"
refused 'short SHA' "$(short "$second")" "$full"
refused 'upper-case SHA' "$(printf %s "$second" | tr a-f A-F)" "$full"
refused 'extra argument' "$second --force" "$full"
refused 'shell metacharacters' "$second;id" "$full"
# shellcheck disable=SC2016 # the $(id) must reach the script literally
refused '40 characters with a command' \
  "$(printf %s "$second" | cut -c1-35)"'$(id)' "$full"
refused 'unknown commit' 0123456789abcdef0123456789abcdef01234567 'unknown commit'
refused 'commit not on main' "$side" 'is not on main'

# Deploys a commit the checkout has not fetched yet.
reset
echo four >"$work/origin/file"
git_q -C "$work/origin" commit -q -am four
latest=$(git -C "$work/origin" rev-parse HEAD)
latest_tag="sha-$(short "$latest")"
if run "$latest"; then
  head_is "$latest" || fail 'deploy: checkout is not at the commit'
  tag_is "$latest_tag" || fail 'deploy: IMAGE_TAG not set'
  grep -qx 'POSTGRES_PASSWORD=secret' "$work/checkout/prod.env" ||
    fail 'deploy: other prod.env lines changed'
  docker_calls_are "$latest_tag" deploy
else
  fail "deploy: exit non-zero: $(cat "$work/out")"
fi

# Rolls back to an older commit on main.
reset
git -C "$work/checkout" checkout -q --detach "$second"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=sha-$(short "$second")/" \
  "$work/checkout/prod.env"
if run "$first"; then
  head_is "$first" || fail 'rollback: checkout is not at the commit'
  tag_is "sha-$(short "$first")" || fail 'rollback: IMAGE_TAG not set'
  docker_calls_are "sha-$(short "$first")" rollback
else
  fail "rollback: exit non-zero: $(cat "$work/out")"
fi

# By hand: the commit as the first argument, no SSH_ORIGINAL_COMMAND.
reset
if (
  unset SSH_ORIGINAL_COMMAND IMAGE_TAG
  export SFM_DEPLOY_DIR="$work/checkout" FAKE_DOCKER_LOG="$work/docker.log" \
    PATH="$work/bin:$PATH"
  sh "$script" "$second"
) >"$work/out" 2>&1; then
  head_is "$second" || fail 'by hand: checkout is not at the commit'
  tag_is "sha-$(short "$second")" || fail 'by hand: IMAGE_TAG not set'
  docker_calls_are "sha-$(short "$second")" 'by hand'
else
  fail "by hand: exit non-zero: $(cat "$work/out")"
fi

# Adds IMAGE_TAG to a prod.env that lacks it.
reset
sed -i '/^IMAGE_TAG=/d' "$work/checkout/prod.env"
run "$second" || fail "missing IMAGE_TAG: exit non-zero: $(cat "$work/out")"
tag_is "sha-$(short "$second")" || fail 'missing IMAGE_TAG: not added'

# A failed pull stops before up and leaves the files as they were.
reset
if run "$second" pull; then fail 'failed pull: exit 0'; fi
grep -q ' up ' "$work/docker.log" && fail 'failed pull: up was called'
grep -qx "\[sha-$(short "$second")\] .* pull api web" "$work/docker.log" ||
  fail "failed pull: no pull of the new tag in: $(cat "$work/docker.log")"
grep -q 'pulling the .* images failed' "$work/out" ||
  fail "failed pull: no error message in: $(cat "$work/out")"
head_is "$first" || fail 'failed pull: checkout not restored'
tag_is "$baseline_tag" || fail 'failed pull: prod.env changed'

# A failed pull whose restore also fails says where the checkout is.
reset
if run "$second" pull-locked; then fail 'failed restore: exit 0'; fi
grep -q "could not check out $first again; the checkout is at $second" "$work/out" ||
  fail "failed restore: no message in: $(cat "$work/out")"
grep -q ' up ' "$work/docker.log" && fail 'failed restore: up was called'
rm -f "$work/checkout/.git/index.lock"

# An interrupted pull (a cancelled run) restores the checkout too.
reset
if run "$second" pull-term; then fail 'interrupted pull: exit 0'; fi
grep -q 'interrupted during the pull' "$work/out" ||
  fail "interrupted pull: no message in: $(cat "$work/out")"
grep -q ' up ' "$work/docker.log" && fail 'interrupted pull: up was called'
head_is "$first" || fail 'interrupted pull: checkout not restored'
tag_is "$baseline_tag" || fail 'interrupted pull: prod.env changed'

# A failed up fails the deploy.
reset
if run "$second" up; then fail 'failed up: exit 0'; fi

# resolve-commit.sh, in a clone as the workflow runs it.
reset
resolves() {
  (cd "$work/checkout" && sh "$resolve" "$1") >"$work/out" 2>"$work/err"
}
main_head=$(git -C "$work/origin" rev-parse main)
if resolves ''; then
  [ "$(cat "$work/out")" = "$main_head" ] || fail "resolve empty: printed $(cat "$work/out")"
else
  fail "resolve empty: exit non-zero: $(cat "$work/err")"
fi
if resolves "$(short "$first")"; then
  [ "$(cat "$work/out")" = "$first" ] || fail "resolve short SHA: printed $(cat "$work/out")"
else
  fail "resolve short SHA: exit non-zero: $(cat "$work/err")"
fi
# unresolved NAME INPUT MESSAGE: fails with MESSAGE and prints no SHA.
unresolved() {
  if resolves "$2"; then fail "resolve $1: exit 0"; fi
  [ -s "$work/out" ] && fail "resolve $1: printed $(cat "$work/out")"
  grep -q "$3" "$work/err" || fail "resolve $1: no '$3' in: $(cat "$work/err")"
  return 0
}
git -C "$work/checkout" fetch -q origin side
unresolved 'unknown commit' nonexistent 'unknown commit'
unresolved 'option as input' "--output=$work/x" 'unknown commit'
[ -e "$work/x" ] && fail 'resolve option as input: git wrote a file'
unresolved 'commit not on main' "$side" 'is not on main'

if [ "$failures" -ne 0 ]; then
  echo "test-deploy: $failures failure(s)" >&2
  exit 1
fi
echo 'test-deploy: all cases passed'
