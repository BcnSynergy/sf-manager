import type { Role } from '@sf-manager/validation';
import { NAV_ITEMS_BY_ROLE } from '../layout/nav-items';

// Whether the role's navigation offers the page at `path`. The home page
// shows a block that links to a page (alerts, recent activity) only when
// this holds, so it never links to a page the role cannot open and never
// requests data the role would be denied. An unrecognized role gets none.
export function roleOffers(role: Role, path: string): boolean {
  return (
    Object.hasOwn(NAV_ITEMS_BY_ROLE, role) &&
    NAV_ITEMS_BY_ROLE[role].some((item) => item.to === path)
  );
}
