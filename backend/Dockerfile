# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# BASE: shared build/runtime prerequisites
# ---------------------------------------------------------------------------
FROM node:22.12-slim AS base
ENV NODE_ENV=production \
    MEDUSA_BE_PATH=/medusa \
    YARN_ENABLE_IMMUTABLE_INSTALLS=false
WORKDIR /medusa
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# DEPS: full dependency tree (build-time incl. devDeps for tsc/build)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# ---------------------------------------------------------------------------
# BUILD: compile to .medusa
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN yarn build

# ---------------------------------------------------------------------------
# RUNTIME: production deps + compiled output only
# ---------------------------------------------------------------------------
FROM base AS runner
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true \
    && yarn cache clean
COPY --from=build /medusa/.medusa ./.medusa
COPY --from=build /medusa/medusa-config.js ./medusa-config.js 2>/dev/null || true
COPY --from=build /medusa/medusa-config.ts ./medusa-config.ts 2>/dev/null || true
COPY --from=build /medusa/src ./src 2>/dev/null || true
COPY --from=build /medusa/tsconfig.json ./tsconfig.json 2>/dev/null || true
EXPOSE 9000
CMD ["bash", "-c", "yarn medusa migrations run && yarn start"]
