#!/bin/sh
# Off-site copies of the backups for the production stack (EN-104; spec
# `deployment`, "Off-site backup copies"). Runs in the `offsite` service of
# docker-compose.prod.yml, which mounts the host's ./backups at /backups and
# passes the OFFSITE_* variables from prod.env.
#
#   offsite-copy.sh         copy now, then every hour
#   offsite-copy.sh once    copy now and exit
#   offsite-copy.sh pull    download every copy into /backups and exit
#
# It copies the complete dumps and files archives (never a temporary
# .partial file) to an S3-compatible bucket, encrypted with
# OFFSITE_ENCRYPTION_PASSWORD before they leave the server. A copy only
# adds: files already in the bucket are skipped, and nothing in the bucket
# is ever deleted, so a problem on the server cannot remove the copies.
# Expiring old copies is a lifecycle rule on the bucket (README "Off-site
# copies"). Without the password the copies cannot be read, so it must be
# kept somewhere other than this server.
#
# With every OFFSITE_* variable empty the copy is off: the service logs that
# and idles. Setting only some of them is an error.
set -eu

# Pulled copies hold password hashes and personal data: readable by root
# only, like the backups themselves.
umask 077

backup_dir=/backups

missing=''
for name in OFFSITE_S3_ENDPOINT OFFSITE_S3_BUCKET OFFSITE_S3_ACCESS_KEY_ID \
  OFFSITE_S3_SECRET_ACCESS_KEY OFFSITE_ENCRYPTION_PASSWORD; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || missing="$missing $name"
done

if [ "$missing" = ' OFFSITE_S3_ENDPOINT OFFSITE_S3_BUCKET OFFSITE_S3_ACCESS_KEY_ID OFFSITE_S3_SECRET_ACCESS_KEY OFFSITE_ENCRYPTION_PASSWORD' ]; then
  if [ -n "${1:-}" ]; then
    echo "offsite: off-site copy is not configured (OFFSITE_* in prod.env)" >&2
    exit 1
  fi
  echo "offsite: off-site copy disabled, no OFFSITE_* variables set"
  # Idle instead of exiting, so the restart policy does not loop.
  while true; do sleep 86400; done
fi
if [ -n "$missing" ]; then
  echo "offsite: set every OFFSITE_* variable or none; missing:$missing" >&2
  exit 1
fi

# Remotes come only from the environment: no config file, and no notice
# about its absence in the log. Transfer statistics stay out of it too.
export RCLONE_CONFIG=''
export RCLONE_STATS_LOG_LEVEL=DEBUG

# rclone reads its remotes from RCLONE_CONFIG_<NAME>_<OPTION>. `bucket` is
# the S3 bucket; `offsite` encrypts file contents on the way to it. The
# bucket must already exist, so the access key needs no right to create
# buckets. File names stay readable (they are only timestamps), so the
# bucket's lifecycle rule and a listing remain usable.
export RCLONE_CONFIG_BUCKET_TYPE=s3
export RCLONE_CONFIG_BUCKET_PROVIDER="${OFFSITE_S3_PROVIDER:-Other}"
export RCLONE_CONFIG_BUCKET_ENDPOINT="$OFFSITE_S3_ENDPOINT"
export RCLONE_CONFIG_BUCKET_REGION="${OFFSITE_S3_REGION:-auto}"
export RCLONE_CONFIG_BUCKET_ACCESS_KEY_ID="$OFFSITE_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_BUCKET_SECRET_ACCESS_KEY="$OFFSITE_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_BUCKET_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_OFFSITE_TYPE=crypt
export RCLONE_CONFIG_OFFSITE_REMOTE="bucket:$OFFSITE_S3_BUCKET"
export RCLONE_CONFIG_OFFSITE_FILENAME_ENCRYPTION=off
export RCLONE_CONFIG_OFFSITE_DIRECTORY_NAME_ENCRYPTION=false
RCLONE_CONFIG_OFFSITE_PASSWORD=$(rclone obscure "$OFFSITE_ENCRYPTION_PASSWORD")
export RCLONE_CONFIG_OFFSITE_PASSWORD

copy_once() {
  if ! rclone copy "$backup_dir" offsite: --max-depth 1 \
    --include 'sfmanager-*.dump' --include 'sfmanager-*.files.tar.gz' \
    --log-level INFO; then
    echo "offsite: copy failed, retrying next cycle" >&2
    return 1
  fi
  echo "offsite: copy complete"
}

case "${1:-}" in
  '') ;;
  once)
    copy_once
    exit
    ;;
  pull)
    # A wrong password fails here, as rclone cannot decrypt the copies.
    if ! rclone copy offsite: "$backup_dir" --max-depth 1 --log-level INFO; then
      echo "offsite: pull failed" >&2
      exit 1
    fi
    echo "offsite: pulled the copies into backups/"
    exit
    ;;
  *)
    echo "usage: offsite-copy.sh [once | pull]" >&2
    exit 1
    ;;
esac

while true; do
  # A failed copy is logged and retried on the next cycle instead of
  # stopping the service.
  copy_once || true
  sleep 3600
done
