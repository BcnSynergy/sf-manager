import { createContext, useContext } from 'react';
import type { DemoInfo } from '../api/demo';

export type DemoAccounts = Extract<DemoInfo, { enabled: true }>;

// demo-instance S6 (spec `deployment`, "Demo identification"): the demo's
// accounts, or null outside the demo, while the answer is pending, and when
// the API cannot be reached (the app then looks like production).
// DemoProvider fills it.
export const DemoContext = createContext<DemoAccounts | null>(null);

export function useDemoInfo(): DemoAccounts | null {
  return useContext(DemoContext);
}
