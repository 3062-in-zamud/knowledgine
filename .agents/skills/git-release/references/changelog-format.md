# CHANGELOG Format Specification

## Standard

Based on [Keep a Changelog](https://keepachangelog.com/) with package subcategories.

## Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [X.Y.Z] - YYYY-MM-DD

### Added

#### CLI (`@knowledgine/cli`)

- Feature description

#### Core (`@knowledgine/core`)

- Feature description

#### Ingest (`@knowledgine/ingest`)

- Feature description

#### MCP Server (`@knowledgine/mcp-server`)

- Feature description

#### Documentation

- Documentation change

#### Infrastructure

- CI/build change

### Changed

- Refactoring or performance change

### Fixed

- Bug fix description

### Deprecated

- Deprecation notice
```

## Section Order

1. Added (new features, capabilities)
2. Changed (modifications to existing features)
3. Fixed (bug fixes)
4. Deprecated (features marked for removal)

Only include sections that have entries. Omit empty sections.

## Package Subcategories (under Added)

Only use subcategories under "Added" when there are entries for multiple packages.
For "Changed", "Fixed", "Deprecated" — use flat list unless disambiguation is needed.

| Package path                     | Subcategory heading                             |
| -------------------------------- | ----------------------------------------------- |
| `packages/cli/**`                | `#### CLI (\`@knowledgine/cli\`)`               |
| `packages/core/**`               | `#### Core (\`@knowledgine/core\`)`             |
| `packages/ingest/**`             | `#### Ingest (\`@knowledgine/ingest\`)`         |
| `packages/mcp-server/**`         | `#### MCP Server (\`@knowledgine/mcp-server\`)` |
| `docs/**`, documentation commits | `#### Documentation`                            |
| `.github/**`, config, CI         | `#### Infrastructure`                           |

## Commit Type → Section Mapping

| Commit type | CHANGELOG section                                         |
| ----------- | --------------------------------------------------------- |
| `feat`      | Added                                                     |
| `fix`       | Fixed                                                     |
| `refactor`  | Changed                                                   |
| `perf`      | Changed                                                   |
| `docs`      | Added > Documentation                                     |
| `ci`        | Added > Infrastructure                                    |
| `build`     | Added > Infrastructure                                    |
| `chore`     | Omit (unless noteworthy, e.g., version bumps are omitted) |
| `test`      | Omit                                                      |
| `style`     | Omit                                                      |

## Entry Format

- Start with bold keyword if it names a feature: `**Feature Name**: description`
- Use imperative mood or descriptive phrase
- No trailing period
- No ticket/issue numbers

Good:

```
- **Agent Skills Setup**: interactive 3-step agent configuration across 13 platforms
- Hierarchical `.knowledginerc` discovery with enhanced DX
```

Bad:

```
- Added the agent skills setup feature. (KNOW-305)
- We implemented hierarchical config discovery.
```
