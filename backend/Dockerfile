# syntax=docker/dockerfile:1

# Medusa needs its generated .medusa/server output at runtime, including the
# admin build. PandaStack must build this image as a Docker project so the
# generated output is copied into the final image instead of being discarded
# by the platform's generic Node runtime.

FROM node:22.12-slim AS build

ENV NODE_ENV=development \
    YARN_ENABLE_IMMUTABLE_INSTALLS=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:22.12-slim AS runtime

ENV NODE_ENV=production \
    YARN_ENABLE_IMMUTABLE_INSTALLS=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN corepack enable \
    && yarn install --frozen-lockfile --production=true \
    && yarn cache clean

# Keep the compiled Medusa server and admin assets together. The start command
# uses this output and does not rebuild on every container boot.
COPY --from=build /app/.medusa ./.medusa

EXPOSE 9000

CMD ["sh", "-c", "yarn medusa db:migrate && yarn start"]
