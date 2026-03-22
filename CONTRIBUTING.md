# Contributing to knowledgine

Welcome! We are glad you are interested in contributing to knowledgine. Whether you are
fixing a typo, reporting a bug, proposing a feature, or writing code, every contribution
is valuable and appreciated.

This guide explains how to get started, what we expect from contributions, and how to
work effectively within the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [PR Review Checklist](#pr-review-checklist)
- [Commit Convention](#commit-convention)
- [Contributor Ladder](#contributor-ladder)
- [Communication](#communication)
- [Versioning](#versioning)
- [License](#license)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you
are expected to uphold this code. Please report unacceptable behavior by opening an issue.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** >= 18.17.0 (LTS recommended)
- **pnpm** >= 9
- **Git**
- **C++ build tools** (required for `better-sqlite3`):
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt-get install build-essential python3`
  - Windows: `npm install -g windows-build-tools`

## Development Environment Setup

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/knowledgine.git
   cd knowledgine
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Build all packages:**

   ```bash
   pnpm build
   ```

4. **Run type checking:**

   ```bash
   pnpm typecheck
   ```

5. **Run tests:**

   ```bash
   pnpm test:run
   ```

6. **Run the full verification suite** (build + typecheck + lint + format check + tests):

   ```bash
   pnpm run verify
   ```

   This is the same check that runs in CI. Make sure it passes before submitting a PR.

## Project Structure

knowledgine is a TypeScript ESM monorepo managed with pnpm workspaces.

```
knowledgine/
├── packages/
│   ├── core/          # Knowledge extraction engine, storage, search, and graph
│   ├── cli/           # CLI for indexing, serving, and management
│   ├── mcp-server/    # MCP server exposing knowledge tools to AI assistants
│   └── ingest/        # Ingest engine with plugin-based data ingestion pipeline
├── .github/           # GitHub Actions workflows, issue templates, and automation
├── eslint.config.js   # Shared ESLint configuration (flat config)
├── tsconfig.json      # Root TypeScript configuration
└── package.json       # Root package with shared scripts and devDependencies
```

### Package Responsibilities

| Package               | npm Name                  | Description                                                                                                                               |
| --------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`       | `@knowledgine/core`       | Core knowledge extraction engine, graph storage, vector search, and embedding pipeline. The foundation that all other packages depend on. |
| `packages/cli`        | `@knowledgine/cli`        | Command-line interface for indexing codebases, running the MCP server, and managing knowledge stores.                                     |
| `packages/mcp-server` | `@knowledgine/mcp-server` | Model Context Protocol server that exposes knowledge tools for use by AI coding assistants.                                               |
| `packages/ingest`     | `@knowledgine/ingest`     | Plugin-based ingestion engine for importing data from various sources (git history, editor sessions, etc.).                               |

### Dependency Graph

```
cli ──> mcp-server ──> core
                        ^
ingest ─────────────────┘
```

## Development Workflow

### Branch Naming

Use descriptive branch names with a category prefix:

- `feat/short-description` -- new features
- `fix/short-description` -- bug fixes
- `docs/short-description` -- documentation changes
- `refactor/short-description` -- code refactoring
- `test/short-description` -- test improvements
- `chore/short-description` -- maintenance tasks

### Working on a Change

1. **Create a branch** from `main`:

   ```bash
   git checkout -b feat/my-feature main
   ```

2. **Make your changes** in small, focused commits.

3. **Run verification** before pushing:

   ```bash
   pnpm run verify
   ```

4. **Push and open a Pull Request** against `main`.

### Keeping Your Branch Up to Date

```bash
git fetch origin
git rebase origin/main
```

## Coding Standards

### TypeScript Style

- Use **strict TypeScript** -- avoid `any` unless absolutely necessary and document why.
- Prefer `interface` over `type` for object shapes that may be extended.
- Use `readonly` for properties that should not be mutated after construction.
- Mark function return types explicitly for public APIs.
- Prefer `unknown` over `any` for values of uncertain type.

### ESM Patterns

This project uses **ES Modules exclusively** (no CommonJS).

- Always use `import`/`export` syntax.
- Use **explicit file extensions** in relative imports (e.g., `import { foo } from './foo.js'`).
- Do not use `require()` or `module.exports`.

### Import Conventions

- Order imports: Node.js built-ins, external packages, internal packages, relative imports.
- Use named exports over default exports.
- Import from package entry points (e.g., `@knowledgine/core`) rather than deep internal paths when consuming across packages.

### General Guidelines

- Keep functions small and focused.
- Prefer immutable data structures.
- Write self-documenting code; add comments only when the _why_ is not obvious.
- Use `async`/`await` over raw Promises.
- Handle errors explicitly -- do not swallow exceptions silently.

## Testing Guidelines

We use [Vitest](https://vitest.dev/) for all testing.

### Running Tests

```bash
# Run all tests once
pnpm test:run

# Run tests in watch mode during development
pnpm test

# Run tests with coverage report
pnpm test:coverage
```

### Coverage Requirements

- Target **80% code coverage** for all packages.
- New code should include tests. PRs that reduce coverage may be asked to add more tests.

### Test Patterns

- Place test files in a `tests/` directory within each package, or co-locate with source files using `*.test.ts` or `*.spec.ts` naming.
- Use descriptive `describe` and `it` blocks that read like specifications.
- Prefer testing behavior over implementation details.
- Use Vitest's built-in mocking (`vi.fn()`, `vi.mock()`) rather than external mocking libraries.
- Keep tests isolated -- each test should set up and tear down its own state.

### Example Test Structure

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../src/my-module.js";

describe("myFunction", () => {
  it("should return expected result for valid input", () => {
    const result = myFunction("valid-input");
    expect(result).toBe("expected-output");
  });

  it("should throw on invalid input", () => {
    expect(() => myFunction("")).toThrow("Input must not be empty");
  });
});
```

## Pull Request Process

1. Fill out the [PR template](.github/pull_request_template.md) completely.
2. Ensure `pnpm run verify` passes locally and in CI.
3. Request a review from a maintainer.
4. Address review feedback promptly. Push new commits rather than force-pushing during review so that reviewers can see incremental changes.
5. A maintainer will merge the PR once it is approved and CI is green.

## PR Review Checklist

Use this checklist when reviewing or self-reviewing a PR:

- [ ] `pnpm run verify` passes (build, typecheck, lint, format, tests)
- [ ] Tests added or updated for all changes
- [ ] No unnecessary `any` types introduced
- [ ] Public APIs have explicit return types and JSDoc comments
- [ ] Error cases are handled, not silently ignored
- [ ] No secrets, credentials, or sensitive data committed
- [ ] Commit messages follow [Conventional Commits](#commit-convention)
- [ ] Documentation updated if public API changed
- [ ] No unrelated changes bundled into the PR

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | Purpose                                                 |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `test`     | Adding or updating tests                                |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore`    | Maintenance tasks (deps, CI, tooling)                   |
| `perf`     | Performance improvement                                 |
| `ci`       | CI/CD configuration changes                             |
| `style`    | Formatting, whitespace (no code logic change)           |

### Scopes

Use the package name as scope when the change is specific to one package:

- `feat(core): add vector similarity search`
- `fix(cli): handle missing config file gracefully`
- `docs(mcp-server): update tool documentation`
- `feat(ingest): add git-history plugin`

## Contributor Ladder

We recognize contributors at different levels of involvement:

### Contributor

Anyone who has contributed to the project in any form: code, documentation, bug reports,
feature requests, or community support.

- Submit issues and PRs
- Participate in discussions
- Listed in release notes for contributions

### Committer

Contributors who have demonstrated sustained, high-quality contributions and a solid
understanding of the project architecture.

- Granted write access to the repository
- Can review and approve PRs
- Help triage issues and guide new contributors
- Nominated by existing maintainers

### Maintainer

Committers who take on broader project stewardship responsibilities.

- Set project direction and priorities
- Manage releases
- Make architectural decisions
- Mentor committers and contributors
- Responsible for upholding the Code of Conduct

To advance through the ladder, contribute consistently and engage with the community.
Promotions are based on trust, quality, and sustained involvement.

## Communication

- **GitHub Issues** -- Bug reports, feature requests, and questions.
- **GitHub Discussions** -- Open-ended conversations, ideas, and Q&A.
- **Pull Requests** -- Code review and technical discussion.

When in doubt, open an issue. We are happy to help.

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** -- incompatible API changes
- **MINOR** -- new functionality, backward compatible
- **PATCH** -- bug fixes, backward compatible

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
