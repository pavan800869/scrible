FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
# The server serves this build from apps/web/dist, so API and SPA share an origin.
RUN pnpm -C apps/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "-C", "apps/server", "exec", "tsx", "src/index.ts"]
