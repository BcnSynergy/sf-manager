// demo-instance S6 (spec `deployment`, "Demo identification"): the demo stack
// sets DEMO_MODE=true so the API tells the web app it is the public demo.
// Unset or empty means off. Any other value than "true" or "false" throws at
// boot, like API_DOCS_ENABLED, so a typo never shows or hides the demo
// accounts silently.
export function isDemoMode(env: NodeJS.ProcessEnv): boolean {
  const raw = env.DEMO_MODE;
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error(`DEMO_MODE must be "true" or "false", got "${raw}"`);
}
