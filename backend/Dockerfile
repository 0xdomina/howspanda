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
RUN npm run build

FROM node:22.12-slim AS runtime

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps \
    && npm cache clean --force

# Keep the compiled Medusa server and admin assets together. The start command
# uses this output and does not rebuild on every container boot.
COPY --from=build /app/.medusa ./.medusa
COPY --from=build /app/.medusa/server/medusa-config.js ./medusa-config.js

EXPOSE 9000

CMD ["sh", "-c", "./node_modules/.bin/medusa db:migrate && npm run start"]
