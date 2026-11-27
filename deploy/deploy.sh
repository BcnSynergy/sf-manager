#!/bin/sh
# Deploys one commit of main to production or to the public demo (EN-185,
# demo-instance T3; spec `deployment`, "Deploy from CI"). It runs the README
# upgrade steps ("Production deployment", step 4): check out the commit, pin
# IMAGE_TAG to its images, pull them and restart the stack.
#
# The deploy workflow (.github/workflows/deploy.yml) runs it over SSH as the
# forced command of the target's deploy key, so the commit arrives in
# SSH_ORIGINAL_COMMAND and the key can run nothing else. The target is fixed
# by that forced command, never by the client: production's key runs it
# with no argument, the demo's key with `demo` (README, "Deploying from
# CI"). Install a copy outside the checkouts, so checking out an older commit
# cannot remove it. By hand, pass the target (optional, production by
# default) and the commit:
#
#   sh ~/bin/sf-manager-deploy [demo] <full 40-character commit SHA>
#
# Production runs from ~/sf-manager with prod.env; the demo from its own
# checkout, ~/sf-manager-demo, with docker-compose.demo.yml and demo.env, so
# deploying one never moves the other's files. SFM_DEPLOY_DIR overrides the
# checkout. Any failing step stops the deploy with a non-zero exit.
set -eu

target=production
case "${1-}" in
  production | demo)
    target=$1
    shift
    ;;
esac
# The Compose arguments of each target, one word each (no spaces), expanded
# unquoted below: a prefix assignment (IMAGE_TAG=...) must go straight to
# `docker`, not to a shell function.
if [ "$target" = demo ]; then
  dir="${SFM_DEPLOY_DIR:-$HOME/sf-manager-demo}"
  env_file=demo.env
  files='-f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env'
else
  dir="${SFM_DEPLOY_DIR:-$HOME/sf-manager}"
  env_file=prod.env
  files='-f docker-compose.prod.yml --env-file prod.env'
fi
sha="${SSH_ORIGINAL_COMMAND-${1-}}"

refuse() {
  echo "deploy: $1" >&2
  exit 2
}

# Only a full lower-case SHA: nothing from the input reaches a shell
# unchecked.
case "$sha" in
  *[!0-9a-f]* | '') refuse "expected a full 40-character commit SHA, got '$sha'" ;;
esac
[ "${#sha}" -eq 40 ] || refuse "expected a full 40-character commit SHA, got '$sha'"

cd "$dir"
git fetch -q origin main
git cat-file -e "$sha^{commit}" 2>/dev/null || refuse "unknown commit $sha"
git merge-base --is-ancestor "$sha" origin/main || refuse "$sha is not on main"

previous=$(git rev-parse HEAD)
git checkout -q --detach "$sha"
# CI tags the images with `git rev-parse --short=7`, which gives more
# characters only when 7 are ambiguous; then the pull says `not found`.
tag="sha-$(printf %s "$sha" | cut -c1-7)"
# Pull before the env file names the new tag (a shell IMAGE_TAG overrides
# the file), so a failed pull leaves the checkout and the env file matching
# the running stack.
# A message that cannot stop the deploy, even once the output is gone.
say() { echo "deploy: $1" >&2 || true; }
# restore REASON: checks out the previous commit first, then reports.
restore() {
  # A second signal (HUP after TERM) must not start a second restore.
  trap '' HUP INT TERM
  if git checkout -q --detach "$previous"; then
    say "$1; checkout restored to $previous"
  else
    say "$1; could not check out $previous again; the checkout is at $sha"
  fi
  exit 1
}
# A cancelled run drops the SSH session during the pull: sshd closes the
# pipes (writing to them would raise SIGPIPE) or sends HUP. Ignore SIGPIPE
# and restore in both cases.
trap '' PIPE
trap 'restore "interrupted during the pull"' HUP INT TERM
# shellcheck disable=SC2086 # $files is one Compose argument per word
if ! IMAGE_TAG="$tag" docker compose $files pull api web; then
  restore "pulling the $tag images failed; $env_file unchanged"
fi
trap - HUP INT TERM PIPE
grep -q '^IMAGE_TAG=' "$env_file" || printf '\nIMAGE_TAG=\n' >>"$env_file"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$env_file"

# Waits for the API healthcheck: Caddy starts only once the API is healthy.
# The demo's reset service restarts with the new image, so a demo deploy
# also resets the demo.
# shellcheck disable=SC2086 # $files is one Compose argument per word
docker compose $files up -d --no-build
echo "deploy: $target now runs $tag ($sha)"
