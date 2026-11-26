# syntax=docker/dockerfile:1.7
# Images for the local stack (docker compose up). Each runtime image is plain Alpine with only the node binary
# and the app's own files: no npm, yarn, corepack, pnpm, tsx, compilers or dev dependencies, and no apk installs
# (so builds need no Alpine package mirror). compose.yaml runs them with `init: true` for signal handling.
#
#   setup           runs migrations, the content ingest and the sample seed once (bundled to one file)
#   lab-controller  provisions lab sessions on the host's Docker, relays terminals, grades and sweeps (one file)
#   web             the Next.js standalone server
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret: --secret id=extra_ca,src=/path/to/ca.crt
# Registry fetches retry with backoff, and the install step reruns up to 3 times if the registry hiccups.
# Bump NODE_VERSION and ALPINE_VERSION together (the node image tag must exist for that Alpine release).

ARG NODE_VERSION=22.23.5
ARG ALPINE_VERSION=3.24
ARG ALPINE_PATCH=3.24.4

# --- Build: full Node toolchain, all workspace dependencies, Next build and esbuild bundles ----------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
# Manifests first, so source edits reuse the dependency layer (and the pnpm store cache mount across builds).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY platform/packages/curriculum/package.json platform/packages/curriculum/
COPY platform/packages/curriculum-mcp/package.json platform/packages/curriculum-mcp/
COPY platform/packages/labs/package.json platform/packages/labs/
COPY platform/apps/web/package.json platform/apps/web/
COPY platform/apps/lab-controller/package.json platform/apps/lab-controller/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; \
    export npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=10000 npm_config_fetch_retry_maxtimeout=120000; \
    for n in 1 2 3; do \
      corepack prepare --activate && pnpm install --frozen-lockfile && break; \
      [ "$n" = 3 ] && exit 1; echo "pnpm install failed (attempt $n/3), retrying in $((n * 15))s" >&2; sleep $((n * 15)); \
    done
COPY tsconfig.base.json ./
COPY scripts scripts
COPY platform platform
RUN node scripts/bundle.mjs dist/bundles
RUN NODE_ENV=production pnpm --filter @lfct/web build

# --- Runtime base: Alpine + the node binary and its two shared libraries from the official image ----------------
# Same Alpine release as the node image, so the copied libstdc++/libgcc match what node was built against.
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node
FROM alpine:${ALPINE_PATCH} AS runtime
COPY --from=node /usr/lib/libstdc++.so.6* /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN addgroup -g 1000 -S node && adduser -u 1000 -S -G node -h /home/node -s /sbin/nologin node \
 && node --version
ENV NODE_ENV=production

# --- setup: migrations + ingest + seed, then exits ------------------------------------------------------------
# The bundle resolves content/ and the migration folders at their repository paths under /repo.
FROM runtime AS setup
WORKDIR /repo
COPY --chown=root:root content content
COPY --from=build /repo/platform/packages/curriculum/drizzle platform/packages/curriculum/drizzle
COPY --from=build /repo/platform/apps/web/drizzle platform/apps/web/drizzle
COPY --from=build /repo/dist/bundles/setup.mjs platform/apps/web/dist/setup.mjs
USER node
CMD ["node", "platform/apps/web/dist/setup.mjs"]

# --- lab-controller ---------------------------------------------------------------------------------------------
# Starts as root only to join the group that owns the mounted Docker socket (its gid differs between Docker
# Desktop and Linux hosts), then switches to "node" before loading the app. See docker-entrypoint.mjs.
FROM runtime AS lab-controller
WORKDIR /app
COPY platform/apps/lab-controller/docker-entrypoint.mjs ./docker-entrypoint.mjs
COPY --from=build /repo/dist/bundles/lab-controller.mjs ./lab-controller.mjs
EXPOSE 3001
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=20 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "docker-entrypoint.mjs"]

# --- web: Next.js standalone server -----------------------------------------------------------------------------
FROM runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/platform/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/platform/apps/web/.next/static ./platform/apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/sign-in',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node", "platform/apps/web/server.js"]
