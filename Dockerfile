# syntax=docker/dockerfile:1.7
# Images for the local stack (docker compose up):
#   workspace       the monorepo with all dependencies: runs migrations, ingest and seed (the "setup" service)
#   lab-controller  provisions lab sessions on the host's Docker, relays terminals, grades and sweeps
#   web             the Next.js standalone server
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret: --secret id=extra_ca,src=/path/to/ca.crt

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY platform/packages/curriculum/package.json platform/packages/curriculum/
COPY platform/packages/curriculum-mcp/package.json platform/packages/curriculum-mcp/
COPY platform/packages/labs/package.json platform/packages/labs/
COPY platform/apps/web/package.json platform/apps/web/
COPY platform/apps/lab-controller/package.json platform/apps/lab-controller/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; \
    corepack prepare --activate && pnpm install --frozen-lockfile

FROM deps AS workspace
COPY tsconfig.base.json ./
COPY content content
COPY platform platform
CMD ["pnpm", "--filter", "@lfct/web", "db:setup"]

FROM workspace AS lab-controller
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@lfct/lab-controller", "start"]

FROM workspace AS web-build
ENV NODE_ENV=production
RUN pnpm --filter @lfct/web build

FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN useradd --system nextjs
COPY --from=web-build --chown=nextjs /repo/platform/apps/web/.next/standalone ./
COPY --from=web-build --chown=nextjs /repo/platform/apps/web/.next/static ./platform/apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "platform/apps/web/server.js"]
