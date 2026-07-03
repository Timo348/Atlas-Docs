FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/collab/package.json apps/collab/package.json
COPY package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM dependencies AS build-web
COPY tsconfig.base.json ./
COPY apps ./apps
RUN npm run build --workspace=@atlas/web

FROM dependencies AS build-collab
COPY tsconfig.base.json ./
COPY apps ./apps
RUN npm run build --workspace=@atlas/collab

FROM dependencies AS tools
COPY prisma ./prisma

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache openssl wget
COPY --from=build-web /app/apps/web/.next/standalone ./
COPY --from=build-web /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:22-alpine AS collab
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl wget
COPY --from=build-collab /app/package.json ./
COPY --from=build-collab /app/node_modules ./node_modules
COPY --from=build-collab /app/apps/collab ./apps/collab
COPY --from=build-collab /app/prisma ./prisma
EXPOSE 1234
CMD ["npm", "run", "start", "--workspace=@atlas/collab"]
