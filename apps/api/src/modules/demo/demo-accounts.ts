import type { Role } from '../users/domain/role';

// demo-instance S6: the public demo's login details, shown on its login page
// (GET /demo) and seeded by the demo dataset (spec `demo-seed-data`), which
// imports them from here. They live outside src/shared/seeding so the
// running API never depends on seeding code.

// Public: one password for every demo account. It goes through CreateUser,
// so the shared password policy validates it.
export const DEMO_PASSWORD = 'sf-manager-demo-1';

const DOMAIN = '@demo.sf-manager.example';

export function demoEmail(local: string): string {
  return `${local}${DOMAIN}`;
}

export type DemoAccount = { email: string; role: Role };

// One account per role a visitor can try; never a system admin.
export const DEMO_LOGIN_ACCOUNTS: readonly DemoAccount[] = [
  { email: demoEmail('gestor'), role: 'MANAGER' },
  { email: demoEmail('empresa1'), role: 'MAINTENANCE_COMPANY_MANAGER' },
  { email: demoEmail('tecnico1a'), role: 'MAINTENANCE_TECHNICIAN' },
  { email: demoEmail('presidente1'), role: 'COMMUNITY_REPRESENTATIVE' },
];
