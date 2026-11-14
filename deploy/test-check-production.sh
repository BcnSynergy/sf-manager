#!/bin/sh
# Tests for deploy/check-production.sh (EN-92; spec `deployment`,
# "Production monitoring"). Serves a fake site from a throwaway Caddy
# container with a self-signed certificate, and runs the check from a
# throwaway Alpine container on the same network, so the client's curl and
# openssl are the same on every machine (Git Bash's curl uses Windows'
# certificate store and ignores CURL_CA_BUNDLE). Removes both containers and
# the network afterwards. CI runs it on every PR and push to main; run it
# from the repository root:
#
#   sh deploy/test-check-production.sh [SCRIPT]
#
# SCRIPT defaults to deploy/check-production.sh; passing a modified copy
# shows which case catches a change.
set -eu

script="${1:-deploy/check-production.sh}"
# Same image as the web service, so a Dependabot bump is tested too.
caddy_image=$(sed -n 's/^FROM \(caddy:[^ ]*\).*/\1/p' apps/web/Dockerfile | head -n 1)
[ -n "$caddy_image" ] || {
  echo "test-check-production: no caddy image in apps/web/Dockerfile" >&2
  exit 1
}
# The client side only: the workflow itself runs on the GitHub runner.
client_image=alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f
p="sfm-check-test-$$"
retry_out=$(mktemp)
url=https://site:8443
# Git Bash on Windows would rewrite the container paths below.
export MSYS_NO_PATHCONV=1

cleanup() {
  docker rm -f "$p-site" "$p-client" >/dev/null 2>&1 || true
  docker network rm "$p" >/dev/null 2>&1 || true
  rm -f "$retry_out"
}
trap cleanup EXIT
# dash skips the EXIT trap on a signal, so exit explicitly (Ctrl-C locally).
trap 'exit 130' INT TERM

fail() {
  echo "test-check-production: FAIL: $1" >&2
  [ -z "${out:-}" ] || printf '%s\n' "--- last output:" "$out" >&2
  exit 1
}
# Clears $out, so a later failure never shows an unrelated run's output.
pass() {
  echo "test-check-production: ok: $1"
  out=''
}

docker network create "$p" >/dev/null
docker run -d --name "$p-client" --network "$p" "$client_image" sleep 3600 >/dev/null
docker exec "$p-client" apk add --no-cache -q curl openssl >/dev/null ||
  fail "could not install curl and openssl in the client container"
docker exec -i "$p-client" sh -c 'cat >/check.sh' <"$script"
# Self-signed certificates for the site's name, valid for 90 and 5 days.
for days in 90 5; do
  docker exec "$p-client" sh -c "mkdir -p /certs/${days}d && openssl req -x509 \
    -newkey rsa:2048 -nodes -days $days -subj /CN=site \
    -addext subjectAltName=DNS:site -keyout /certs/${days}d/key.pem \
    -out /certs/${days}d/cert.pem" >/dev/null 2>&1 ||
    fail "could not create a $days-day certificate"
done
ok_body='{"status":"ok","db":"ok"}'

# Serves the fake site at $url: serve CERT_DAYS (ok|503) [BODY].
serve() {
  docker rm -f "$p-site" >/dev/null 2>&1 || true
  if [ "$2" = ok ]; then
    handler='root * /etc/check
		rewrite * /health.json
		file_server'
  else
    handler='respond 503'
  fi
  # The site's files are assembled in the client container and streamed
  # into the site container as a tar, so no host path is involved.
  docker exec -i "$p-client" sh -c "rm -rf /check && mkdir /check &&
    cp /certs/$1d/cert.pem /certs/$1d/key.pem /check/ && cat >/check/Caddyfile" <<EOF
{
	admin off
	auto_https disable_redirects
}
https://:8443 {
	tls /etc/check/cert.pem /etc/check/key.pem
	handle /api/health {
		$handler
	}
}
EOF
  printf '%s' "${3:-}" | docker exec -i "$p-client" sh -c 'cat >/check/health.json'
  docker create --name "$p-site" --network "$p" --network-alias site "$caddy_image" \
    caddy run --config /etc/check/Caddyfile >/dev/null
  docker exec "$p-client" tar -C / -cf - check | docker cp - "$p-site:/etc"
  docker start "$p-site" >/dev/null
  i=0
  until docker exec "$p-client" curl -ks --max-time 2 "$url/" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 30 ] || fail "the fake site did not start: $(docker logs "$p-site" 2>&1 | tail -n 5)"
    sleep 1
  done
}

# Runs the check against the fake site, trusting the certificate named by
# $1 (default 90d); sets $out and $rc.
check() {
  set +e
  out=$(docker exec -e CURL_CA_BUNDLE="/certs/${1:-90d}/cert.pem" \
    -e CHECK_ATTEMPTS=2 -e CHECK_PAUSE=1 "$p-client" sh /check.sh "$url" 2>&1)
  rc=$?
  set -e
}

serve 90 ok "$ok_body"
check
[ "$rc" -eq 0 ] || fail "a healthy site with a 90-day certificate should pass (exit $rc)"
pass "healthy site passes"

serve 90 503
check
[ "$rc" -ne 0 ] || fail "a 503 from /api/health should fail the check"
printf '%s' "$out" | grep -qi 'health' || fail "a failed health check should name the health check"
pass "503 from /api/health fails"

# The API answers 503 when its database is down; these pin each key the
# check reads, one at a time.
serve 90 ok '{"status":"ok","db":"unreachable"}'
check
[ "$rc" -ne 0 ] || fail "a 200 whose body does not say the database is ok should fail the check"
pass "200 with the database not ok fails"

serve 90 ok '{"status":"error","db":"ok"}'
check
[ "$rc" -ne 0 ] || fail "a 200 whose body does not say the status is ok should fail the check"
pass "200 with the status not ok fails"

serve 90 ok '{ "status": "ok", "db": "ok" }'
check
[ "$rc" -eq 0 ] || fail "spaces in the health JSON should not fail the check (exit $rc)"
pass "health JSON with spaces passes"

serve 5 ok "$ok_body"
check 5d
[ "$rc" -ne 0 ] || fail "a certificate expiring in 5 days should fail the check"
printf '%s' "$out" | grep -qi 'certificate' || fail "an expiring certificate should name the certificate"
printf '%s' "$out" | grep -q 'notAfter=' || fail "an expiring certificate should show its expiry date"
pass "certificate expiring within 14 days fails"

serve 90 ok "$ok_body"
check 5d
[ "$rc" -ne 0 ] || fail "a certificate the client does not trust should fail the check"
printf '%s' "$out" | grep -q 'health check attempt 2/2 failed: HTTP 000' ||
  fail "an untrusted certificate should fail the health check's HTTPS request"
printf '%s' "$out" | grep -q 'certificate ok' ||
  fail "an untrusted but long-lived certificate should still pass the expiry check"
pass "untrusted certificate fails"

docker rm -f "$p-site" >/dev/null
check
[ "$rc" -ne 0 ] || fail "a site that does not answer should fail the check"
printf '%s' "$out" | grep -qi 'health' || fail "an unanswered health check should name the health check"
pass "site down fails"

# The site answers 503 to the first attempt and recovers during the pause
# after it, so only a retry sees it healthy. (A site that is down instead
# would make the first attempt wait on DNS, which may outlast the recovery.)
serve 90 503
docker exec -e CURL_CA_BUNDLE=/certs/90d/cert.pem -e CHECK_ATTEMPTS=3 -e CHECK_PAUSE=8 \
  "$p-client" sh /check.sh "$url" >"$retry_out" 2>&1 &
pid=$!
sleep 3
serve 90 ok "$ok_body"
set +e
wait "$pid"
rc=$?
set -e
out=$(cat "$retry_out")
[ "$rc" -eq 0 ] || fail "a site that recovers before the last attempt should pass (exit $rc)"
printf '%s' "$out" | grep -q 'attempt 1/3 failed' || fail "the first attempt should have failed"
pass "a dropped request is retried"

echo "test-check-production: all cases passed"
