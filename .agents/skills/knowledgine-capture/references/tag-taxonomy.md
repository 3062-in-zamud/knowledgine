# Tag Taxonomy

Standard tags for knowledgine knowledge captures. Use 2–5 tags per capture.
Choose the most specific applicable tags; avoid generic tags like "code" or "misc".

---

## Primary Category Tags (choose one)

| Tag                  | Use for                                                |
| -------------------- | ------------------------------------------------------ |
| `bug-fix`            | Resolved defects with root cause analysis              |
| `design-decision`    | Architectural or implementation choices with reasoning |
| `pattern`            | Reusable code or design patterns                       |
| `troubleshooting`    | Multi-step diagnostic processes                        |
| `external-knowledge` | Insights from external sources (docs, articles, SO)    |
| `refactoring`        | Code quality improvements                              |

## Domain Tags (choose 0–3)

### Languages & Runtimes

| Tag          | Use for                                   |
| ------------ | ----------------------------------------- |
| `typescript` | TypeScript-specific patterns, type system |
| `javascript` | JavaScript-specific patterns              |
| `nodejs`     | Node.js runtime, native modules, ESM      |
| `sql`        | SQL queries, schema design                |
| `bash`       | Shell scripts, CLI tools                  |

### Quality & Safety

| Tag              | Use for                                        |
| ---------------- | ---------------------------------------------- |
| `null-safety`    | Null/undefined handling, optional chaining     |
| `type-safety`    | TypeScript strict mode, type guards            |
| `error-handling` | Error propagation, try/catch patterns          |
| `validation`     | Input validation, schema validation            |
| `security`       | Auth, injection prevention, secrets management |
| `testing`        | Test patterns, test utilities, coverage        |

### Architecture

| Tag            | Use for                              |
| -------------- | ------------------------------------ |
| `architecture` | High-level structural decisions      |
| `api-design`   | REST, RPC, GraphQL interface design  |
| `database`     | Database schema, migrations, queries |
| `caching`      | In-memory or distributed caching     |
| `async`        | Async/await patterns, concurrency    |

### Infrastructure & Tooling

| Tag              | Use for                                  |
| ---------------- | ---------------------------------------- |
| `build`          | Build system, bundler configuration      |
| `ci-cd`          | CI/CD pipelines, GitHub Actions          |
| `devops`         | Deployment, infrastructure as code       |
| `dependencies`   | Package management, version upgrades     |
| `native-modules` | Native Node.js addons, ABI compatibility |
| `esm`            | ES modules, import/export                |
| `performance`    | Optimization, profiling, benchmarks      |
| `memory`         | Memory management, leak detection        |

### Project-Specific

| Tag                 | Use for                            |
| ------------------- | ---------------------------------- |
| `sqlite`            | SQLite, sqlite-vec, FTS5           |
| `mcp`               | Model Context Protocol integration |
| `embedding`         | Vector embeddings, semantic search |
| `entity-extraction` | Named entity recognition, graph    |
| `ingest`            | Knowledge ingestion pipeline       |

---

## Tagging Examples

| Scenario                                | Tags                                          |
| --------------------------------------- | --------------------------------------------- |
| Fixed a TypeScript null reference error | `bug-fix`, `typescript`, `null-safety`        |
| Decided to use Zod for validation       | `design-decision`, `validation`, `typescript` |
| Found ESM import extension pattern      | `external-knowledge`, `esm`, `nodejs`         |
| Optimized SQLite FTS5 query             | `performance`, `sqlite`, `database`           |
| Refactored command handler structure    | `refactoring`, `architecture`                 |
