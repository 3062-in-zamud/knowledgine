# Build stage
FROM node:20 AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/cli/package.json packages/cli/
COPY packages/ingest/package.json packages/ingest/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Runtime stage
# node:20-slim/alpine are NOT usable (onnxruntime-node requires libstdc++)
FROM node:20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=builder /app .
EXPOSE 3000
ENTRYPOINT ["node", "packages/mcp-server/dist/index.js"]
