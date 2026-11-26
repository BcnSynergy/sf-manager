# Demo instance on the production VPS

Objective: run a public demo with fictitious data at `sfmanager.demo.bcnsynergy.com` next to production on the same VPS, and deploy either one at will. Delivery: `stacked-to-main`, branches `demo-instance/<NN>-<slug>`, one PR per phase (forecast about 1200 authored lines in 4 PRs). Runners: Jest in `apps/api` (`npm test`, `npm run test:integration`), Vitest in `apps/web`, shell tests in `deploy/test-*.sh`, `deploy/smoke-test.sh` (CI), `npm run format:check`.
Locator: `odd/tasks/demo-instance.md` (Engram mirror: `odd/demo-instance/tasks`). Spec change: yes (`deployment`; user accepted the plan with "si", 2026-11-26).

## Specs

- **S1** Goal (user, verbatim): "por producción a voluntad me referia a que en el vps que ya tenemos desplegar produccion o desplegar demo, pero si me dices que podemos configurar otro endpoiont por ejemplo sfmanager.demo.bcnsynergy.com ya podria ser suficiente para que los reclutadores o personas interesadas en la aplicacion pudieran probarla".
- **S2** Approach A, accepted ("si, y sube el esfuezo a high si lo consideras necesario"): "Un Caddy independiente ocupa 80/443 y lleva los certificados. Envía cada dominio a su stack (`sfmanager…` a prod, `sfmanager.demo…` a la demo). Los `web` dejan de publicar puertos."
- **S3** Phase 1, front proxy: "prod pasa a funcionar detrás de él, sin ningún cambio visible." Production keeps its URL, HTTPS, HTTP->HTTPS redirect, security headers (HSTS, CSP, nosniff, referrer), single origin with `/api`, and the real client IP for rate limiting. Delicate (Risk item 5), its own PR, with a rollback plan.
- **S4** Phase 2, demo stack: "un segundo proyecto compose con su base de datos, sus volúmenes y su `.env`, todo separado de prod. Incluye un seed de demo activado por una bandera explícita (nunca `NODE_ENV=development` en público), un reset nocturno, sin email real, sin copias offsite y con `noindex`." Before the demo joins `sf-edge`, the production `web` must trust the forwarding header from the edge proxy only (EN-248, from the T1 Gentle review).
- **S5** Phase 3, deploy at will: "el workflow `Deploy` pasa a recibir el destino (`production` o `demo`), cada uno con su entorno de GitHub. Para prod mantiene tu aprobación; para la demo, si quieres, sin ella."
- **S6** Phase 4, recruiters: "las credenciales de demo visibles en el login y un banner "Demo". Es la UI mínima de la slice."

## Tasks

| ID  | Specs  | Route  | Status      | Commit / PR |
| --- | ------ | ------ | ----------- | ----------- |
| T1  | S2, S3 | inline | in progress | PR 1/4      |
| T2  | S4     | inline | pending     | PR 2/4      |
| T3  | S5     | inline | pending     | PR 3/4      |
| T4  | S6     | inline | pending     | PR 4/4      |

Route evidence: sequential dependent phases, no writer trigger. Risk: T1 item 5 (environment) and item 2 (client IP feeds the login throttle); T2-T3 item 5; independent verifier at the feature's end plus each PR's fresh review. Server changes need the user's OK each time.

## Log

- **L1** (2026-11-26) User asked: "que deberiamos hacer para poder desplegar una demo con datos ficticios o un despliegue a producion a voluntad", then S1, then "la opcion A es la recomendada?" and S2.
- **L2** Mapping (explorer, high effort): prod `web` publishes 80/443 and Caddy in it terminates TLS (`docker-compose.prod.yml:149-151`, `apps/web/Caddyfile`); certificates in volume `caddy-data`; `TRUST_PROXY: '1'` in compose (`:57`); `deploy/smoke-test.sh` needs host 80/443 and `https://localhost`; `ci.yml` validates the web Caddyfile standalone; spec `deployment` requirements "Single public origin", "HTTPS", "Proxy trust", "One-command production stack", "Images built and published by CI" name Caddy as the only public entry point and the only hop; spec `authentication` "Client IP Resolution for Rate Limiting" already covers a hop count of 2.
- **L3** T1 design: front proxy in `deploy/edge/` (own compose project `sf-edge`, own Caddy, own `caddy-data`), shared external Docker network `sf-edge`; the prod `web` joins it under a fixed alias and stops publishing ports, serving plain HTTP; its Caddy keeps every header and trusts the forwarding header only from private ranges (it is reachable only through Docker networks); `TRUST_PROXY=2`. The edge proxy preserves Host. Smoke test brings up both stacks.
- **L4** T1 evidence: full `deploy/smoke-test.sh` passes locally (Docker Desktop) with the new checks: security headers through the edge proxy and no HSTS on localhost (Host passed on), plain HTTP redirected, and the login limit counting the real client (host limited after spoofed-XFF failures, a container on `sf-edge` still logs in). ShellCheck 0.9.0 clean. Probes against a truncated smoke run, all killed: `TRUST_PROXY: '1'` (other address got 429), inner Caddy without `trusted_proxies` (429), edge rewriting Host (`https://localhost/` carried HSTS). Server cutover (README "Moving a server behind the edge proxy") copies `caddy-data` into `sf-edge_caddy-data`, so no new certificate; rollback keeps the old volume. Specs changed: `deployment` (Purpose, One-command production stack, API health in the stack, Single public origin, HTTPS, Security headers, Proxy trust, Images built and published by CI); ADR-011 addendum.
- **L5** T1 Gentle AI review (RDD, 4 lenses, consent granted by the user): approved, receipt acknowledged (lineage review-23ce88a71917d1a4). Its non-blocking findings were applied in the next commit: the rollback stops the edge proxy with its env file (`stop`, since `down` cannot remove the network while the prod web is attached), `--force-recreate` to apply `deploy/edge/` changes (Caddy does not reload a mounted Caddyfile), images pulled before the outage starts, the dangling README reference, the smoke test's 15 attempts explained, curl pinned by digest. Registered instead: EN-247 (domain set twice, no check) and EN-248 (trust only the edge proxy before the demo joins; now part of S4).
- **L6** Gentle review of the fix commit (lineage review-e21e62e9d3266294): approved, acknowledged. Applied: the cutover chains step 2's own pinning lines and the pull with `&&`, so a failed pull stops before `stop web`; the rollback text says step 2 pins `IMAGE_TAG` back. Its "rollback leaves the new tag" concern does not hold: step 2 recomputes the tag from the checkout.
