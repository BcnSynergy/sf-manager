// Express `trust proxy` setting as a hop count. A number N makes Express skip
// N proxies from the socket address and take the next X-Forwarded-For entry
// as `req.ip`, so entries a client prepends cannot choose its own key. `true`
// means exactly one hop (not Express's own `true`, which trusts every hop).
// Anything outside the accepted set throws at boot (design.md Decision 1).
export function getTrustProxySetting(env: {
  TRUST_PROXY?: string | undefined;
}): false | number {
  const raw = env.TRUST_PROXY;
  if (raw === undefined || raw === '' || raw === 'false') {
    return false;
  }
  if (raw === 'true') {
    return 1;
  }
  if (/^[1-9]\d*$/.test(raw)) {
    const hops = Number(raw);
    if (Number.isSafeInteger(hops)) {
      return hops;
    }
  }
  throw new Error(
    `TRUST_PROXY must be unset, "false", "true" or a positive integer hop count, got "${raw}"`,
  );
}
