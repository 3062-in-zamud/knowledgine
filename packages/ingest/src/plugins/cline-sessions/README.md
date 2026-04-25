# cline-sessions plugin

Pull-type ingest plugin for the Cline VS Code extension (`saoudrizwan.claude-dev`).
Parses Cline's per-task JSON storage and emits one capture event per task into
knowledgine.

## Storage layout

Default OS paths (override with `CLINE_STORAGE_PATH` env var, absolute path):

| OS      | Path                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/` |
| Linux   | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/`                     |
| Windows | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\`                     |

The plugin reads:

- `state/taskHistory.json` — `HistoryItem[]` (task index, prompt text, cwd, model, tokens)
- `tasks/<id>/api_conversation_history.json` — primary conversation source (`Anthropic.MessageParam[]`)
- `tasks/<id>/ui_messages.json` — fallback when api file is missing/malformed

Files Cline writes atomically (`temp + rename`); reading concurrently with VS Code
is safe.

## Emitted event shape

One `NormalizedEvent` per task directory:

- `sourceUri`: `cline-session://<storageHash8>/<taskId>` (storageHash8 = sha256 of resolved storage path, first 8 hex)
- `eventType`: `capture`
- `title`: `Cline: ${historyItem.task[:60] || taskId[:8]}`
- `content`: head 100 + `(... N truncated ...)` + tail 100, `### User:` / `### Assistant:` markers, sanitised
- `tags`: `["cline", "ai-session", "cwd:<basename>"]`
- `extra`: `{ taskId, ulid?, workspace, modelId, tokensIn, tokensOut, totalCost, size, messageCount }`

## CLI usage

```bash
# OS-default Cline storage
knowledgine ingest --source cline-sessions --path ./my-notes

# Alternate location (testing, backups, VS Code Insiders, etc.)
CLINE_STORAGE_PATH=/abs/path/to/saoudrizwan.claude-dev \
  knowledgine ingest --source cline-sessions --path ./my-notes
```

## Limitations (v0.1.0)

- `api_conversation_history.json` files larger than 10 MB are skipped with a stderr
  warning (Node heap protection).
- Long tasks beyond 200 messages keep only the first 100 + last 100; the middle is
  represented by a `(... N messages truncated ...)` marker.
- VS Code Insiders / VSCodium / Cursor / Windsurf forks of Cline are not auto-detected;
  set `CLINE_STORAGE_PATH` to point at the relevant `globalStorage/<extId>/` directory.
- Pull side; push-type capture (`POST /capture`) is documented separately in
  `docs/push-based-capture.md`.

## Pinned reference

This implementation targets Cline source pinned at
[`v3.81.0`](https://github.com/cline/cline/releases/tag/v3.81.0). Schema drift in
later majors should be re-validated against `docs/research/cline-session-storage.md`.
