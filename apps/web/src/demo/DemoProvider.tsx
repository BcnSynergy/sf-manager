import { useEffect, useState, type ReactNode } from 'react';
import { fetchDemoInfo } from '../api/demo';
import { DemoContext, type DemoAccounts } from './demo-context';

// demo-instance S6: asks GET /demo once for the whole app, so the banner and
// the login page share one answer (demo-context.ts).
export function DemoProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<DemoAccounts | null>(null);

  useEffect(() => {
    let active = true;
    fetchDemoInfo()
      .then((info) => {
        if (active && info.enabled) setDemo(info);
      })
      .catch(() => {
        // Not the demo as far as this page can tell.
      });
    return () => {
      active = false;
    };
  }, []);

  return <DemoContext.Provider value={demo}>{children}</DemoContext.Provider>;
}
