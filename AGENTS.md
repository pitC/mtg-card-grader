# MTG Card Grader — AGENTS Guide

## Commands

| Command | What it does |
|---|---|
| `npm test` | Run Vitest test suite (jsdom) |
| `npm run lint` | Run ESLint on `js/` and `test/` |
| `make test` | Alias for `npm test` |
| `make lint` | Alias for `npm run lint` |
| `python3 -m http.server [8000]` | Serve the app locally (no build needed); required for CORS (Scryfall/17Lands) |

## Key conventions & quirks

- **No build step**: The app is plain HTML/JS. Run with a local server for CORS support.
- **ESLint**: `no-unused-vars` ignores args matching `_` prefix. `eqeqeq: 'smart'` allows `== null`. `no-console` allows `error` level logs only. `no-alert` and `no-eval` are errors.
- **Vitest**: Tests run in jsdom with `url: 'http://localhost:3000/'`. Setup file is `test/setup.js`.
- **Firestore sync**: Collection keys must be ≥32 random characters. Keys with slashes are invalid (normalize removes them).
- **17Lands comparison**: First run fetches and caches to `localStorage`. Default CORS proxy is `corsproxy.io` (free for localhost/dev). On non-dev hosts, set `?proxy=<working proxy>` or use `?proxy=direct` if the host allows CORS.
- **Grading keys**: A–E keys (also ↓/→ navigation). Grade again to cycle.

## Testing quirks

- Tests use jsdom; browser globals (e.g. `localStorage`) are available.
- `test/setup.js` runs before each test suite.
- Test files cover: `actualGrades`, `constants`, `firestore`, `render`, `scryfall`, `setSelect`, `storage`.
- To run a single test: `npx vitest run --reporter=verbose test/<file>` (or just `npm test` for all).

## Directory ownership

- `js/` — all app source (bootstrap, state, event wiring, API helpers, rendering, storage)
- `test/` — Vitest unit tests
- `css/` — base.css + views.css
- `index.html` — app shell and markup
- `firebase.js` — lazy Firebase SDK loading (embedded config in `index.html`)

## Common gotchas

- ESLint `no-console` is `warn` only for `error`; other consoles will trigger warnings.
- `prefer-template` rule is triggered by scryfall.js:13 — prefer template literals over string concat.
- `no-else-return` and `no-lonely-if` are enforced — avoid else-after-return and deeply nested ifs.
- Firestore rules: collectionKey must be ≥32 chars; document IDs limited to lowercase 3-letter set codes.
- The app has no auth — Firestore sync uses "obscurity-based capability" via collection key.