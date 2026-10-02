# Contributing

**Required UI standard:** follow the [Wikimedia Codex types and order of buttons](https://doc.wikimedia.org/codex/latest/style-guide/using-links-and-buttons.html#types-and-order-of-buttons). Use one primary progressive action per group, normal secondary actions, and quiet tertiary actions. Cancellation is neutral; reserve destructive actions for irreversible changes. Put the primary action last in horizontal flows (respecting LTR/RTL reading direction) and first when stacked. Dialog footers align to the inline end; separate ordinary buttons with `spacing-75` (12px). Codex ButtonGroup supplies its own spacing. Keep visual and keyboard order aligned.

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
- `npm run screenshots`: regenerate all documentation images at 1024 × 768, DPR 1.

All automated API behavior uses fixtures or mocked adapters. Do not mutate a
live wiki from tests. Cover meaningful changes to page targeting, previews,
manual edits, conflict recovery, and save outcomes with behavior tests.

Keep pure rules independent of browser and MediaWiki globals. Compose host
adapters in `src/app/main.ts`, pass dependencies through typed contracts, and
retain the side-effect-free public entry point. Keep each template-only `.vue` file beside the same-named TypeScript behavior
and package-scoped CSS; these three files form one UI component. Production Vue and Codex
come from MediaWiki, while npm packages supply types and browser fixtures.

Update all three locale catalogs together, including their named
placeholders. Render article source, API text, and messages as text. Preserve
the exact preview-before-save contract documented in the
[review workflow](docs/review-workflow.md).

## Button hierarchy and order

Treat the [Codex types and order of buttons](https://doc.wikimedia.org/codex/latest/style-guide/using-links-and-buttons.html#types-and-order-of-buttons)
as the required review checklist for every action group.

| Action                             | Weight  | Action type | Codex props                             |
| ---------------------------------- | ------- | ----------- | --------------------------------------- |
| Cancel                             | Quiet   | Neutral     | `weight="quiet" action="default"`       |
| Stage / 暂存 or Unstage / 取消暂存 | Normal  | Neutral     | `weight="normal" action="default"`      |
| Submit / Submit (+N)               | Primary | Progressive | `weight="primary" action="progressive"` |

The assessment footer presents Cancel, Stage/Unstage, then Submit horizontally.
At widths of 640px or less it stacks Submit, Stage/Unstage, then Cancel; its DOM
order changes with the layout so focus follows the same sequence. Retain the
12px spacing in both orientations. Closing a dialog is a neutral cancellation.
Category class actions are equally weighted choices in Codex ButtonGroup;
Cancel is quiet neutral and Retry is the single primary progressive recovery
action when loading fails. Preserve preparation and saving disabled states,
including cancellation during preparation. Staging and unstaging retain the
open form and use the same normal neutral button.

Use Codex Message for contextual eligibility notices, recoverable problems,
and save feedback. Keep loading progress in the dialog's polite live region.
Use the injected native MediaWiki notification port for outcomes that must
remain visible after a dialog closes. Render messages and source as text.

## Documentation screenshots

Run `npm run screenshots` after a material UI change. It builds the gadget and
uses the offline Playwright host with `DOCUMENTATION_SCREENSHOTS=1`, an exact
1024 × 768 viewport, and device scale factor 1. No live wiki is contacted and
no saves are performed. The dedicated documentation scenarios replace all
three numbered images in `docs/images/`: assessment choices, proposed source,
and category assessment. Inspect all images before committing them. Temporary
test output is removed by `scripts/test-ui.mjs`.

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
