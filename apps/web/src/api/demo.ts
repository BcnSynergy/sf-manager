import type { Role } from '@sf-manager/validation';
import { apiFetch } from './client';

export type DemoAccount = { email: string; role: Role };

export type DemoInfo =
  { enabled: false } | { enabled: true; password: string; accounts: DemoAccount[] };

// demo-instance S6 (spec `deployment`, "Demo identification"): public, so it
// never answers 401 and the session refresh in apiFetch never runs for it.
export function fetchDemoInfo(): Promise<DemoInfo> {
  return apiFetch<DemoInfo>('/demo');
}
