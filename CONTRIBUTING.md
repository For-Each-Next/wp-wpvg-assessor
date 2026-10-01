# Contributing

Read [architecture](docs/architecture.md) before changing source boundaries.
Use Node.js 24.14.1 or newer and `npm ci` to install the tracked dependency
tree. Install Chromium with `npx playwright install chromium` for UI tests.

```shell
npm ci
npx playwright install chromium
npm run verify
```

The build generates `dist/wpvg_assessor.min.js` for MediaWiki and
`dist/wpvg_assessor.user.js` for userscript managers. Vue and Codex come from
the wiki's ResourceLoader in production; the browser bundle includes neither
runtime.

## Development loop

- `npm run format`: apply the four-space code style.
- `npm run check`: check formatting, lint, types, and unused code.
- `npm test`: run offline unit and service tests.
- `npm run build`: generate both independent installation artifacts.
- `npm run test:ui`: build and run offline Chromium interaction tests.
- `npm run verify`: run the complete validation gate.

All automated API behavior uses fixtures or mocked adapters. Do not mutate a
live wiki from tests. Cover meaningful changes to page targeting, previews,
manual edits, conflict recovery, and save outcomes with behavior tests.

Keep pure rules independent of browser and MediaWiki globals. Compose host
adapters in `src/app/main.ts`, pass dependencies through typed contracts, and
retain the side-effect-free public entry point. Keep Vue templates separate
from TypeScript behavior and package-scoped CSS. Production Vue and Codex
come from MediaWiki, while npm packages supply types and browser fixtures.

Update all three locale catalogs together, including their named
placeholders. Render article source, API text, and messages as text. Preserve
the exact preview-before-save contract documented in the
[review workflow](docs/review-workflow.md).

Run `npm run verify` for material changes. Rebuild `dist/` instead of editing
generated artifacts. Record notable changes in `CHANGELOG.md`; keep technical
details in `docs/` and preserve upstream licensing notices.

## Diagnostics

Set the following before loading the gadget to enable debug logging:

```javascript
window.wpvgAssessorConfig = { logLevel: "debug" };
```

The default log level is `warn`. Logging redacts editable source, titles,
tokens, and summaries. The available levels are `silent`, `error`, `warn`,
`info`, and `debug`.
