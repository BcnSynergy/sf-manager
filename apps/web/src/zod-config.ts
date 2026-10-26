import { z } from 'zod';

// EN-94: Caddy serves the app with a Content-Security-Policy that has no
// 'unsafe-eval'. Zod 4 otherwise probes `new Function` on its first parse to
// compile faster validators; the probe is caught, but the browser still
// reports it as a CSP violation. jitless skips the probe.
z.config({ jitless: true });
