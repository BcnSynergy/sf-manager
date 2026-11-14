#!/bin/sh
# Checks the production site from outside the server (EN-92; spec
# `deployment`, "Production monitoring"). The scheduled workflow
# .github/workflows/production-check.yml runs it; a non-zero exit fails the
# run, and GitHub's failed-run notification is the alert. Run it by hand
# with:
#
#   sh deploy/check-production.sh https://sfmanager.bcnsynergy.com
#
# It fails when:
# - /api/health does not answer 200 with "status":"ok" and "db":"ok" over a
#   trusted HTTPS connection, on every one of CHECK_ATTEMPTS tries (default
#   3), CHECK_PAUSE seconds apart (default 20), so one dropped request does
#   not alert;
# - the certificate expires within CHECK_MIN_DAYS days (default 14). Caddy
#   renews a 90-day certificate about 30 days before it expires, so this
#   fires only when renewal has been failing for a while.
set -eu

url="${1:?usage: check-production.sh https://host[:port]}"
attempts="${CHECK_ATTEMPTS:-3}"
pause="${CHECK_PAUSE:-20}"
min_days="${CHECK_MIN_DAYS:-14}"

case "$url" in
  https://*) ;;
  *)
    echo "check-production: the URL must start with https:// ($url)" >&2
    exit 2
    ;;
esac
url="${url%/}"
hostport="${url#https://}"
hostport="${hostport%%/*}"
host="${hostport%:*}"
port=443
[ "$host" = "$hostport" ] || port="${hostport##*:}"

failed=0

# Health: the body must report both the API and its database as ok.
i=1
while :; do
  # No --fail: the body of an error response is worth printing as well. The
  # last line is the status code, 000 when no response came; curl's own
  # error, if any, comes before it.
  body=$(curl -sS --max-time 20 -w '\n%{http_code}' "$url/api/health" 2>&1) || true
  code=$(printf '%s\n' "$body" | tail -n 1)
  body=$(printf '%s\n' "$body" | sed '$d')
  if [ "$code" = 200 ] &&
    printf '%s' "$body" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' &&
    printf '%s' "$body" | grep -Eq '"db"[[:space:]]*:[[:space:]]*"ok"'; then
    echo "check-production: health ok ($body)"
    break
  fi
  echo "check-production: health check attempt $i/$attempts failed: HTTP $code: $body" >&2
  if [ "$i" -ge "$attempts" ]; then
    failed=1
    break
  fi
  i=$((i + 1))
  sleep "$pause"
done

# Certificate: read what the server presents, whoever issued it. s_client
# has no timeout of its own, so a port that drops packets would hang it;
# `timeout` bounds it where it exists (not on stock macOS).
limit=''
! command -v timeout >/dev/null 2>&1 || limit='timeout 30'
# shellcheck disable=SC2086 # $limit is empty or two words
if cert=$($limit openssl s_client -connect "$host:$port" -servername "$host" </dev/null 2>/dev/null |
  openssl x509 2>/dev/null) && [ -n "$cert" ]; then
  enddate=$(printf '%s\n' "$cert" | openssl x509 -noout -enddate)
  if printf '%s\n' "$cert" | openssl x509 -noout -checkend $((min_days * 86400)) >/dev/null; then
    echo "check-production: certificate ok ($enddate)"
  else
    echo "check-production: certificate expires within $min_days days ($enddate)" >&2
    failed=1
  fi
else
  echo "check-production: could not read the certificate from $host:$port" >&2
  failed=1
fi

exit "$failed"
