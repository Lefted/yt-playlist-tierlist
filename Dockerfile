# The app image: SvelteKit built with adapter-node, served by `node build` on 3000.
#
# Two stages so the runtime carries no toolchain and no dev dependencies. The node
# tag is pinned to a major.minor — a bare `22-alpine` would silently change the
# runtime between two builds of the same commit.

FROM node:22.23-alpine AS build

WORKDIR /app

# Dependencies first: this layer is reused for every build that does not touch the
# lockfile, which is most of them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# adapter-node marks everything in `dependencies` as external, so the runtime stage
# needs a real node_modules — pruned here rather than reinstalled there, which keeps
# the two trees identical.
RUN npm run build && npm prune --omit=dev


FROM node:22.23-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Provenance, surfaced by GET /api/v1/meta. The deploy script passes the short sha
# and an ISO timestamp; `unknown` keeps a plain `docker build` working.
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Owned by root and read-only to the app user: the server never writes to its own
# files, and an image that cannot rewrite itself is one less thing to think about.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
# The migrations travel with the binary that expects them; the boot hook reads this
# folder relative to the working directory.
COPY --from=build /app/drizzle ./drizzle

# `node` (uid 1000) ships with the image; no user has to be created.
USER node

EXPOSE 3000

CMD ["node", "build"]
