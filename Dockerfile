# Production image: builds the web bundle and runs the Hono API (which serves
# the bundle from the same origin). One container = API + web.
FROM node:22-bookworm AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    SERVE_WEB=1 \
    WEB_ROOT=./out/web \
    PORT=3001
# Reuse the already-installed/built deps from the builder (avoids a second
# install + any native rebuilds).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/out/web ./out/web
COPY --from=builder /app/server ./server
COPY --from=builder /app/main ./main
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.web.json /app/tsconfig.node.json /app/tsconfig.server.json ./
EXPOSE 3001
# `start` runs the server via tsx; openDb() applies migrations + seeds on boot.
CMD ["npm", "start"]
