// dev-seed-data design.md Decision 3: host and port only, so the seed log
// can name its target database without ever leaking `user:pass@`. Pure and
// total: an unset or malformed URL yields 'unknown' instead of throwing.
export function describeDatabaseHost(url: string | undefined): string {
  if (!url) {
    return 'unknown';
  }
  try {
    const { host } = new URL(url);
    return host === '' ? 'unknown' : host;
  } catch {
    return 'unknown';
  }
}
