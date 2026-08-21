import { SetMetadata } from '@nestjs/common';

// design.md Decision 4: lives in shared/presentation so `health` (and any
// other module marking a route public) never needs to import the `auth`
// module. The global APP_GUARD (wired in PR 3's auth.module.ts) reads this
// metadata via Reflector to bypass authentication for the marked handler.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
