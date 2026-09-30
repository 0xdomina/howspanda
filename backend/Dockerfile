# syntax=docker/dockerfile:1

# Medusa needs its generated .medusa/server output at runtime, including the
# admin build. PandaStack must build this image as a Docker project so the
# generated output is copied into the final image instead of being discarded
# by the platform's generic Node runtime.

FROM node:22.12-slim AS build

ENV NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev --legacy-peer-deps

COPY . .
RUN npm run build \
    # Admin dashboard ships separately (backend/vercel.json -> Vercel), so
    # drop its static output: thousands of files the API image never serves.
    && rm -rf .medusa/admin \
    # Drop devDependencies after the build: the runtime only needs the
    # compiled .medusa output + production deps (@medusajs/cli spawns the
    # server). Halves the image file count (microVM image packing and cold
    # pulls both benefit; Render/PandaStack use this same Dockerfile).
    && npm prune --omit=dev --legacy-peer-deps \
    # Node never loads these at runtime (~50% of node_modules inodes):
    # type definitions, source maps, READMEs, licenses/changelogs.
    && find ./node_modules -type f \( -name '*.d.ts' -o -name '*.map' -o -name '*.md' -o -iname 'LICENSE*' -o -iname 'LICENCE*' -o -iname 'CHANGELOG*' -o -iname 'AUTHORS*' -o -iname 'NOTICE*' -o -iname 'COPYING*' \) -delete \
    && npm cache clean --force

FROM node:22.12-slim AS runtime

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    HOST=0.0.0.0 \
    PORT=9000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

# Keep the compiled Medusa server and admin assets together. The start command
# uses this output and does not rebuild on every container boot.
COPY --from=build /app/.medusa ./.medusa
COPY --from=build /app/.medusa/server/medusa-config.js ./medusa-config.js
COPY --from=build /app/.medusa/server/src ./src
COPY --from=build /app/.medusa/server/public ./public
COPY --from=build /app/start-production.cjs ./start-production.cjs

EXPOSE 9000

CMD ["node", "start-production.cjs"]
