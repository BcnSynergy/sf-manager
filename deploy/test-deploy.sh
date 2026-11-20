#!/bin/sh
# Tests for deploy/deploy.sh (EN-185; spec `deployment`, "Deploy from CI").
# Builds a throwaway origin repository and a checkout of it, and puts a fake
# `docker` first on PATH that records its arguments, so no container or
# server is involved. CI runs it on every PR and push to main; run it from
# the repository root:
#
#   sh deploy/test-deploy.sh [SCRIPT]
#
# SCRIPT defaults to deploy/deploy.sh; passing a modified copy shows which
# case catches a change.
set -eu

script="$(cd "$(dirname "${1:-deploy/deploy.sh}")" && pwd)/$(basename "${1:-deploy/deploy.sh}")"
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

# Fake docker: records each call; FAKE_DOCKER_FAIL=pull|up makes that
# subcommand fail.
mkdir "$work/bin"
cat >"$work/bin/docker" <<'EOF'
#!/bin/sh
echo "$*" >>"$FAKE_DOCKER_LOG"
case " $* " in
  *" pull "*) [ "${FAKE_DOCKER_FAIL:-}" != pull ] ;;
  *" up "*) [ "${FAKE_DOCKER_FAIL:-}" != up ] ;;
esac
EOF
chmod +x "$work/bin/docker"

# Fresh checkout at $first with a prod.env, before each case.
reset() {
  rm -rf "$work/checkout" "$work/docker.log"
  git clone -q "$work/origin" "$work/checkout"
  git -C "$work/checkout" checkout -q --detach "$first"
  printf 'POSTGRES_PASSWORD=secret\nIMAGE_TAG=sha-0000000\nSITE_ADDRESS=example.test\n' \
    >"$work/checkout/prod.env"
  : >"$work/docker.log"
}

# run INPUT [FAIL]: runs the script as the forced command would.
run() {
  (
    export SSH_ORIGINAL_COMMAND="$1" SFM_DEPLOY_DIR="$work/checkout" \
      FAKE_DOCKER_LOG="$work/docker.log" FAKE_DOCKER_FAIL="${2:-}" \
      PATH="$work/bin:$PATH"
    sh "$script"
  ) >"$work/out" 2>&1
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
  tag_is sha-0000000 || fail "$1: prod.env changed"
  return 0
}

full='expected a full 40-character commit SHA'
refused 'empty input' '' "$full"
refused 'short SHA' "$(printf %s "$second" | cut -c1-7)" "$full"
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
short=$(printf %s "$latest" | cut -c1-7)
if run "$latest"; then
  head_is "$latest" || fail 'deploy: checkout is not at the commit'
  tag_is "sha-$short" || fail 'deploy: IMAGE_TAG not set'
  grep -qx 'POSTGRES_PASSWORD=secret' "$work/checkout/prod.env" ||
    fail 'deploy: other prod.env lines changed'
  expected="compose -f docker-compose.prod.yml --env-file prod.env pull api web
compose -f docker-compose.prod.yml --env-file prod.env up -d --no-build"
  [ "$(cat "$work/docker.log")" = "$expected" ] ||
    fail "deploy: docker calls were: $(cat "$work/docker.log")"
else
  fail "deploy: exit non-zero: $(cat "$work/out")"
fi

# Rolls back to an older commit on main.
reset
git -C "$work/checkout" checkout -q --detach "$second"
if run "$first"; then
  head_is "$first" || fail 'rollback: checkout is not at the commit'
else
  fail "rollback: exit non-zero: $(cat "$work/out")"
fi

# Adds IMAGE_TAG to a prod.env that lacks it.
reset
sed -i '/^IMAGE_TAG=/d' "$work/checkout/prod.env"
run "$second" || fail "missing IMAGE_TAG: exit non-zero: $(cat "$work/out")"
tag_is "sha-$(printf %s "$second" | cut -c1-7)" || fail 'missing IMAGE_TAG: not added'

# A failed pull stops before up.
reset
if run "$second" pull; then fail 'failed pull: exit 0'; fi
grep -q ' up ' "$work/docker.log" && fail 'failed pull: up was called'

# A failed up fails the deploy.
reset
if run "$second" up; then fail 'failed up: exit 0'; fi

if [ "$failures" -ne 0 ]; then
  echo "test-deploy: $failures failure(s)" >&2
  exit 1
fi
echo 'test-deploy: all cases passed'
