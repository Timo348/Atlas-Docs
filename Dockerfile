# Keep the linux/amd64 build and runtime base reproducible with a pinned digest.
ARG NODE_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/collab/package.json apps/collab/package.json
COPY apps/migrate/package.json apps/migrate/package.json
COPY packages/todo/package.json packages/todo/package.json
COPY package-lock.json ./
# Package lifecycle scripts are not needed in the dependency layer. Prisma is
# generated explicitly in the next step, so this install remains deterministic.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

FROM dependencies AS build-web
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN npm run build --workspace=@atlas/todo
RUN npm run build --workspace=@atlas/web

FROM dependencies AS build-collab
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm run build --workspace=@atlas/todo
RUN npm run build --workspace=@atlas/collab

FROM ${NODE_IMAGE} AS collab-runtime-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/collab/package.json apps/collab/package.json
COPY packages/todo/package.json packages/todo/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --workspace=@atlas/collab --include-workspace-root=false
COPY --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build-collab /app/packages/todo/dist ./packages/todo/dist

FROM ${NODE_IMAGE} AS migrate-runtime-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/migrate/package.json apps/migrate/package.json
COPY packages/todo/package.json packages/todo/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --workspace=@atlas/migrate --include-workspace-root=false
COPY --from=build-collab /app/packages/todo/dist ./packages/todo/dist
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM migrate-runtime-dependencies AS tools
ARG ATLAS_VERSION=dev
ARG ATLAS_REVISION=unknown
ARG ATLAS_BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Atlas Docs Migrations" \
      org.opencontainers.image.description="Database migrations and initial seed for Atlas Docs" \
      org.opencontainers.image.source="https://github.com/Timo348/Atlas-Docs" \
      org.opencontainers.image.url="https://github.com/Timo348/Atlas-Docs" \
      org.opencontainers.image.version="${ATLAS_VERSION}" \
      org.opencontainers.image.revision="${ATLAS_REVISION}" \
      org.opencontainers.image.created="${ATLAS_BUILD_DATE}" \
      org.opencontainers.image.licenses="Apache-2.0"
USER node

FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ARG ATLAS_VERSION=dev
ARG ATLAS_REVISION=unknown
ARG ATLAS_BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Atlas Docs Web" \
      org.opencontainers.image.description="Web application and API for Atlas Docs" \
      org.opencontainers.image.source="https://github.com/Timo348/Atlas-Docs" \
      org.opencontainers.image.url="https://github.com/Timo348/Atlas-Docs" \
      org.opencontainers.image.version="${ATLAS_VERSION}" \
      org.opencontainers.image.revision="${ATLAS_REVISION}" \
      org.opencontainers.image.created="${ATLAS_BUILD_DATE}" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=build-web /app/apps/web/.next/standalone ./
COPY --from=build-web /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM ${NODE_IMAGE} AS collab
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG ATLAS_VERSION=dev
ARG ATLAS_REVISION=unknown
ARG ATLAS_BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Atlas Docs Collaboration" \
      org.opencontainers.image.description="Real-time collaboration service for Atlas Docs" \
      org.opencontainers.image.source="https://github.com/Timo348/Atlas-Docs" \
      org.opencontainers.image.url="https://github.com/Timo348/Atlas-Docs" \
      org.opencontainers.image.version="${ATLAS_VERSION}" \
      org.opencontainers.image.revision="${ATLAS_REVISION}" \
      org.opencontainers.image.created="${ATLAS_BUILD_DATE}" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=collab-runtime-dependencies /app/node_modules ./node_modules
COPY --from=collab-runtime-dependencies /app/packages ./packages
COPY --from=build-collab /app/apps/collab/dist ./dist
USER node
EXPOSE 1234
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:1234/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
