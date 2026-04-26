# Changelog — `@knowledgine/mcp-memory-protocol`

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the package adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-04-26

### Added

- **Reference implementation prep**: gap-analysis aligning knowledgine's adapter to spec §3-§11; conformance test kit redesigned around `MemoryProvider` direct injection so external implementations (Mem0, Zep, …) can validate without standing up an MCP server; new `temporal_query` (§8.2) and `ttl` (§9.2) test-suites.
- **`./conformance` subpath export**: import the kit via `@knowledgine/mcp-memory-protocol/conformance`. The main entry stays minimal for production providers.
- **`RecalledMemory` fields**: `deprecated`, `deprecationReason`, `supersedes`, `validFrom` are now part of the public type (spec §6.1), so versioning and temporal_query consumers can read state directly off recall responses.
- **Publish metadata**: `description`, `keywords`, `repository`, `homepage`, `bugs`, `files` populated; `LICENSE`, `CHANGELOG.md`, `MIGRATION.md` shipped in the tarball.
- **Vitest peer dependency** (optional): only required when consuming the conformance kit.

### Changed

- **BREAKING — Conformance API**: the prior shape `runConformanceSuite(ctx, options)` (with an MCP `Client`) is replaced by `runConformanceSuite({ createProvider, teardown?, skip? })`. The new entry point lives at `@knowledgine/mcp-memory-protocol/conformance`. See [`MIGRATION.md`](./MIGRATION.md) for the diff.

## [0.3.1] - 2026-03-29

Initial release of the protocol types, Zod schemas, error factories, and a (now-deprecated) MCP-Client-based conformance harness. See the root [`CHANGELOG.md`](https://github.com/3062-in-zamud/knowledgine/blob/main/CHANGELOG.md) for details.
