# Docker Setup Guide

Run knowledgine as a containerized MCP server using Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 20.10
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.0 (included with Docker Desktop)

## Quick Start

### 1. Place your notes

Put your markdown files in a `notes/` directory at the project root:

```bash
mkdir -p notes
cp -r /path/to/your/markdown/files/* notes/
```

### 2. Initialize the knowledge base

```bash
docker compose --profile init run --rm knowledgine-init
```

This scans your notes and builds the search index.

### 3. Start the MCP server

```bash
docker compose --profile default up knowledgine
```

The server will be available on port 3000 with stdio transport (MCP protocol).

## Environment Variables

| Variable                | Default       | Description                                           |
| ----------------------- | ------------- | ----------------------------------------------------- |
| `KNOWLEDGINE_ROOT_PATH` | `/data/notes` | Path to the notes directory inside the container      |
| `KNOWLEDGINE_SEMANTIC`  | `false`       | Enable semantic (vector) search using ONNX embeddings |

You can set these in a `.env` file at the project root:

```env
KNOWLEDGINE_SEMANTIC=false
```

## Semantic Search Mode

Semantic search (`KNOWLEDGINE_SEMANTIC=true`) uses `onnxruntime-node` to generate embeddings for vector similarity search. While this works inside Docker, be aware of the following:

- **Performance**: ONNX inference is significantly faster on the host machine, especially with GPU acceleration. Consider running knowledgine natively for semantic search workloads.
- **Image size**: The Docker image is larger when ONNX dependencies are included (~1.5 GB+).
- **Platform**: The image is pinned to `linux/amd64`. ARM64 hosts (e.g., Apple Silicon Macs) will run under emulation, which further degrades ONNX performance.

For production semantic search, we recommend running knowledgine directly on the host:

```bash
pnpm install
KNOWLEDGINE_SEMANTIC=true pnpm run build
node packages/mcp-server/dist/index.js
```

## Data Persistence

The Docker Compose configuration uses a named volume (`knowledgine-data`) to persist the search index between container restarts. Your notes are bind-mounted from `./notes` on the host.

To reset the index:

```bash
docker volume rm knowledgine_knowledgine-data
```

Then re-run the init step.

## Troubleshooting

### ARM64 / Apple Silicon issues

The `docker-compose.yml` forces `platform: linux/amd64` because `onnxruntime-node` does not reliably build on `linux/arm64` in Docker. On Apple Silicon Macs, Docker Desktop will use Rosetta 2 emulation automatically. If you encounter crashes:

1. Ensure Docker Desktop has Rosetta emulation enabled (Settings > General > "Use Rosetta for x86_64/amd64 emulation on Apple Silicon").
2. Allocate at least 4 GB of memory to Docker Desktop.
3. If ONNX-related errors persist, disable semantic search by setting `KNOWLEDGINE_SEMANTIC=false`.

### Permission errors on mounted volumes

If the container cannot read your notes or write to the data volume:

```bash
# Check ownership of the notes directory
ls -la notes/

# Fix permissions if needed (make readable by all)
chmod -R a+r notes/
```

On Linux hosts, you may need to match the container's UID (1000 for the `node` user):

```bash
sudo chown -R 1000:1000 notes/
```

### Build failures

If `pnpm install --frozen-lockfile` fails during the Docker build:

1. Ensure `pnpm-lock.yaml` is up to date: run `pnpm install` on the host first.
2. Check that all workspace package.json files are correctly referenced in the Dockerfile COPY steps.
3. Native dependencies (e.g., `better-sqlite3`, `onnxruntime-node`) require build tools. The `node:20` base image includes these, but `node:20-slim` or `node:20-alpine` will not work.

### Container exits immediately

The MCP server uses stdio transport and requires `stdin_open: true` in Docker Compose. If connecting from an MCP client, ensure the client is properly piping stdin/stdout to the container process.
