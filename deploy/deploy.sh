#!/bin/sh
# Deploys one commit of main to production (EN-185; spec `deployment`,
# "Deploy from CI"). It runs the README upgrade steps ("Production
# deployment", step 4): check out the commit, pin IMAGE_TAG to its images,
# pull them and restart the stack.
#
# The deploy workflow (.github/workflows/deploy.yml) runs it over SSH as the
# forced command of the deploy key, so the commit arrives in
# SSH_ORIGINAL_COMMAND and the key can run nothing else. Install a copy
# outside the checkout, so checking out an older commit cannot remove it
# (see README, "Deploying from CI"). By hand, pass the commit as the first
# argument:
#
#   sh ~/bin/sf-manager-deploy <full 40-character commit SHA>
#
# SFM_DEPLOY_DIR is the checkout (default ~/sf-manager). Any failing step
# stops the deploy with a non-zero exit.
set -eu

dir="${SFM_DEPLOY_DIR:-$HOME/sf-manager}"
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
# Pull before prod.env names the new tag (a shell IMAGE_TAG overrides the
# file), so a failed pull leaves the checkout and prod.env matching the
# running stack.
restore() {
  if git checkout -q --detach "$previous"; then
    echo "deploy: checkout restored to $previous" >&2
  else
    echo "deploy: could not check out $previous again; the checkout is at $sha" >&2
  fi
  exit 1
}
# A cancelled run drops the SSH session during the pull: restore then too.
trap 'echo "deploy: interrupted during the pull" >&2; restore' HUP INT TERM
if ! IMAGE_TAG="$tag" docker compose -f docker-compose.prod.yml --env-file prod.env pull api web; then
  echo "deploy: pulling the $tag images failed; prod.env unchanged" >&2
  restore
fi
trap - HUP INT TERM
grep -q '^IMAGE_TAG=' prod.env || printf '\nIMAGE_TAG=\n' >>prod.env
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" prod.env

# Waits for the API healthcheck: Caddy starts only once the API is healthy.
docker compose -f docker-compose.prod.yml --env-file prod.env up -d --no-build
echo "deploy: production now runs $tag ($sha)"
