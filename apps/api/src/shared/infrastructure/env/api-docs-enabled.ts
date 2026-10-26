import { isProduction } from './is-production';

// TD-40: Swagger UI and the OpenAPI document list every route and schema,
// so production keeps them off unless API_DOCS_ENABLED=true; elsewhere they
// stay on unless API_DOCS_ENABLED=false. Any other value throws at boot,
// like TRUST_PROXY, so a typo never silently exposes or hides them.
export function isApiDocsEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.API_DOCS_ENABLED;
  if (raw === undefined || raw === '') return !isProduction(env.NODE_ENV);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`API_DOCS_ENABLED must be "true" or "false", got "${raw}"`);
}
