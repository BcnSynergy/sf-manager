// Express `trust proxy` setting. `true` means exactly one trusted hop (not
// Express's own `true`, which trusts every hop and lets a client choose its
// own `req.ip` through the leftmost X-Forwarded-For entry).
export function getTrustProxySetting(env: {
  TRUST_PROXY?: string | undefined;
}): false | 1 {
  const raw = env.TRUST_PROXY;
  if (raw === undefined || raw === '' || raw === 'false') {
    return false;
  }
  if (raw === 'true') {
    return 1;
  }
  throw new Error(`TRUST_PROXY must be "true" or "false", got "${raw}"`);
}
