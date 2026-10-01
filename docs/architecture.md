# Architecture

WPVG Assessor separates application workflows, pure rules, host integration,
and interface components. It uses ordinary functions, explicit TypeScript
interfaces, and relative imports. The project builds and verifies independently.

## Ownership and dependencies

`src/app/browser.ts` starts `src/app/main.ts`. The composition root creates
MediaWiki adapters, a scoped logger, a notification port, and dialog
workflows, then supplies them to the assessment feature.

- `app/` coordinates loading, preparation, and reviewed saves. Its contracts
  own consumer requirements; workflows receive callbacks for external work.
  Background drafts and cached dialog loads use an injected session store.
  Batch preparation refreshes the registration list and composes one proposed
  list edit; submission retains unfinished drafts after partial failures.
- `domain/` owns assessment parsing, banner transformations, registration
  ordering, namespace rules, and text comparison. It has no runtime browser
  dependencies. `project-config.ts` holds the Chinese Wikipedia banner rules.
- `platform/mediawiki/` validates API responses, reads page context and
  language, loads Codex, and performs timestamp-protected writes.
- `platform/browser/` owns creation-time caching and the assessment session
  store. The latter serializes reviewed drafts, page snapshots, dates, and
  creation-time maps in session storage per wiki/account. It follows navigation
  within one tab. Disposable cache failures allow normal fetching; failed
  draft writes remain visible so the dialog can retain the user's work.
- `features/assessment/` presents controls and previews and owns mounted
  dialog lifecycle. Each dialog and comparison component keeps its markup,
  behavior, and styles in adjacent `.vue`, `.ts`, and `.css` files.
- `shared/` owns host-independent translation, structured logging, and
  notification contracts. `i18n/` supplies product catalogs and locale-aware
  summaries.

Imports point toward pure rules and contracts. Domain and shared code do not
import startup, UI, or platform code. Platform code does not import product
UI or catalogs. Features receive workflows through injected contracts.

`src/index.ts` deliberately exposes deterministic assessment, registration,
and comparison operations without triggering browser startup.

## Build and verification

The standalone Node.js build compiles ES2024 browser JavaScript with esbuild,
injects validated template-only Vue markup and scoped CSS, and minifies the
gadget with Terser. A separate readable userscript includes a Chinese
Wikipedia match rule and waits for MediaWiki before starting.

Vue and Codex npm packages supply local types and offline browser fixtures.
The build rejects runtime dependencies from `node_modules`, preventing a
second Vue or Codex runtime from appearing in production artifacts.

Formatting and lint checks enforce the project's source conventions.
TypeScript and Vue templates are checked without emitting source. Unit and
service tests use Node's test runner. Playwright tests run the actual built
browser gadget
against a local mocked MediaWiki host.
