# Contributing to knowledgine

Thank you for your interest in contributing!

## Prerequisites

- Node.js >= 18
- pnpm >= 9
- C++ build tools for better-sqlite3:
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt-get install build-essential python3`
  - Windows: `npm install -g windows-build-tools`

## Development Setup

```bash
git clone https://github.com/3062-in-zamud/knowledgine.git
cd knowledgine
pnpm install
pnpm run verify
```

## Monorepo Structure

| Package               | Description                                  |
| --------------------- | -------------------------------------------- |
| `packages/core`       | Knowledge extraction engine, storage, search |
| `packages/mcp-server` | MCP server exposing knowledge tools          |
| `packages/cli`        | CLI for indexing and serving                 |

Dependencies: `cli -> mcp-server -> core`

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run `pnpm run verify` to check build, types, lint, format, and tests
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
5. Open a Pull Request

## Commit Convention

We use Conventional Commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `chore:` Maintenance tasks
- `refactor:` Code changes that neither fix bugs nor add features

## Running Tests

```bash
# Run all tests
pnpm run test:run

# Run tests with coverage
pnpm run test:coverage

# Run tests in watch mode
pnpm run test
```

## Pull Request Checklist

- [ ] `pnpm run verify` passes
- [ ] Tests added/updated for changes
- [ ] Follows existing code style
- [ ] Commit messages follow Conventional Commits

## Versioning

This project follows [Semantic Versioning](https://semver.org/).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
