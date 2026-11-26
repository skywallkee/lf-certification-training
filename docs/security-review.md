# Security and accessibility review (2026-11)

A review of the local Docker stack: authentication, the admin content editor, lab terminal and container
isolation, injection, secrets, and WCAG 2.1 AA. What was fixed, and the risks that remain on purpose.

## Fixed

| Area | Finding | Fix |
|------|---------|-----|
| Auth | The sign-in, sign-up, password reset and verification forms call Better Auth from server actions, which skips its HTTP rate limiter, so passwords could be guessed without limit. | In-memory limits (`src/server/rate-limit.ts`): 10 failed sign-ins per email and 30 per client in 15 minutes; 5 emails per address and 20 per client an hour; 10 wrong current passwords per account on Change password. |
| Web | No Content-Security-Policy. | `src/proxy.ts` sends a per-request nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, terminal and docs origins only). |
| Labs | The docs viewer built its upstream URL by appending the raw request target, so `GET @evil.example/` or `GET //evil.example/` fetched another host (SSRF from the controller). | Only paths on the docs site itself are fetched; anything else gets 400. |
| Labs | Learner shells (workstation) and the grader had no process limit and allowed setuid privilege gain. | `no-new-privileges` and a 1,024 process cap on both containers. |
| Secrets | A production build would start with the compose file's placeholder secrets. | Outside `APP_ENV=local` the web app refuses `change-me` or short values for its secrets. |
| A11y | Form errors were not tied to their fields; the sign-up email hint was not announced. | Inputs get `aria-invalid` and `aria-describedby` pointing at the hint and the error. |

The sweep in `e2e/a11y.spec.ts` now runs axe (WCAG 2.0/2.1/2.2 A and AA) on every page that needs no running lab or
quiz, in the light and the dark theme, checks one `h1` and a title per page, 320 px reflow, and the skip link.
Lab, mock and quiz players are checked in their own flows.

## Accepted risks (not fixed)

- **A lab learner can reach the host.** k3s runs as a privileged container and the learner gets cluster-admin,
  so a privileged pod with a `hostPath` mount escapes to the Docker host. k3s in Docker needs this; it is fine on
  your own machine and must not be offered to other people. The cloud plan runs each lab in its own VM.
- **The controller holds the Docker socket**, which is root on the host. Same reason; it is only reachable on
  127.0.0.1 and its API needs the bearer secret.
- **Sample logins with a known password** (`admin@example.com` / `sample-password-123`) are seeded by default.
  Use `SEED=never` for any stack other people can reach.
- **Docs pages share the `localhost` site.** The docs viewer serves kubernetes.io and helm.sh at
  `<site>.localhost:3001`; browsers may treat those as same-site with the app, so their scripts could send
  same-site requests to it. Server actions still check the Origin header, and the sites are the official docs.
- **Rate limits live in memory**, so they reset when the web container restarts and do not cover several
  replicas. Enough for one local container; a shared store is needed in the cloud.
- **Deleting an account needs only the session** and typing DELETE, not the password again.
- **Workstations share the `lfct-labs` network** with each other and the controller. Each terminal still needs
  its own random password and the controller API its secret.
