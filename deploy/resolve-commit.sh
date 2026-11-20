#!/bin/sh
# Resolves the deploy workflow's commit input to a full SHA on main (EN-185;
# spec `deployment`, "Deploy from CI"). .github/workflows/deploy.yml runs it
# in a full clone, before anything contacts the server:
#
#   sh deploy/resolve-commit.sh [COMMIT]
#
# An empty COMMIT means origin/main. Prints the full SHA, or fails naming
# the reason when the commit is unknown or not on origin/main.
set -eu

input="${1:-origin/main}"
sha=$(git rev-parse --verify --quiet --end-of-options "$input^{commit}") || {
  echo "resolve-commit: unknown commit '$input'" >&2
  exit 2
}
git merge-base --is-ancestor "$sha" origin/main || {
  echo "resolve-commit: $sha is not on main" >&2
  exit 2
}
echo "$sha"
