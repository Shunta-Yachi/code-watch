# Code Watch

A VS Code extension that automatically tracks the time you spend working in your editor.

> **Status:** Early development (MVP in progress). Core tracking is not yet functional.

## Features

- **Automatic time tracking** — starts when a workspace opens and stops when it closes, with periodic auto-save (heartbeat).
- **Inactivity detection** — separates non-working time into `sleep`, `unfocused`, and `idle` (recorded only past per-type thresholds).
- **Work record viewer** — a sidebar panel showing daily totals, broken down by workspace and by file, with date navigation.

Records are stored locally in a single SQLite database.

## Settings

| Setting                    | Description                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `codeWatch.timezone`       | Timezone for the record viewer. Empty = auto-detect from your system (falls back to UTC).                |
| `codeWatch.timezoneCustom` | Custom IANA timezone name (e.g. `Pacific/Chatham`), used when `codeWatch.timezone` is set to `(custom)`. |

## Requirements

- VS Code `^1.85.0`

## Development

```bash
npm install
npm run compile   # build extension + webview
npm run watch     # rebuild on change
npm test          # run tests (Vitest)
npm run lint      # ESLint
```

Press `F5` in VS Code to launch the extension in a development host.

## License

[ISC](LICENSE) © Shunta Yachi
