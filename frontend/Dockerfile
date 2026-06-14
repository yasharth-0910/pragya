# Pragya frontend — Next.js 15 (App Router). Multi-stage build: a heavy "builder"
# stage that compiles the app, and a tiny "runner" stage that ships only the
# compiled output. The builder's node_modules / source never reach the final image.

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: builder — install deps and run `next build`.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only the manifests first so `npm ci` is cached in its own layer; it re-runs
# only when package.json / package-lock.json change, not on every source edit.
COPY package.json package-lock.json* ./
# `npm ci` (not `npm install`) — installs exactly from the lockfile: reproducible,
# and it errors if package.json and the lockfile have drifted.
RUN npm ci

# GOTCHA: NEXT_PUBLIC_* env vars are INLINED into the client JS at BUILD time, not
# read at runtime. So the browser-facing API URL must exist NOW, during `next build`
# — setting it only at `docker run` time would have no effect on the shipped bundle.
# We take it as a build ARG (default points at the host-published backend) and
# promote it to an ENV so `next build` picks it up. docker-compose passes this via
# build.args (see FILE 3), which is why FILE 3 also documents it.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Now the rest of the source, then build. With output:'standalone' (next.config.ts)
# this produces .next/standalone (server + minimal node_modules) and .next/static.
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: runner — minimal image, runs the standalone server only.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Production runtime; disables Next.js telemetry in the container.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Copy just the three things the standalone server needs:
# 1) public/        — static assets served as-is.
# 2) .next/standalone — the traced server bundle (includes its own minimal
#    node_modules and server.js). Unpacked at the WORKDIR root.
# 3) .next/static   — hashed JS/CSS chunks; standalone does NOT bundle these, they
#    must sit at .next/static or every page 404s its assets.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Next.js default port.
EXPOSE 3000

# Standalone is launched with `node server.js` — NOT `npm start`/`next start`,
# which would need the full .next build + dev/runtime deps we deliberately dropped.
CMD ["node", "server.js"]
