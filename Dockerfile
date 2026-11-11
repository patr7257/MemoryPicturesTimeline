# Two-stage build for the Memories Next.js app (Dokploy deploy).
# bookworm-slim (glibc) rather than alpine so sharp's prebuilt binaries work.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Stamp the commit into the bundle for the page version gate (/version.json,
# src/lib/use-app-version-gate.ts). Dokploy passes no commit, so build-info.mjs
# reads .git from the build context; GIT_SHA, when given, wins. .git lives only
# in this build stage: the run stage below copies the build output alone.
ARG GIT_SHA
RUN node scripts/build-info.mjs /tmp/build-info.json \
  && export NEXT_PUBLIC_COMMIT_SHA="$(node -p "require('/tmp/build-info.json').sha")" \
  && export NEXT_PUBLIC_BUILT_AT="$(node -p "require('/tmp/build-info.json').builtAt")" \
  && pnpm build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
