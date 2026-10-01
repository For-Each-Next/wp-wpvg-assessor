# WPVG Assessor contributor instructions

Read `CONTRIBUTING.md` and `docs/architecture.md` before changing structure.

- Keep startup and workflows in `src/app/`, pure rules in `src/domain/`, host
  integration in `src/platform/`, and UI in `src/features/`.
- Keep `src/index.ts` side-effect free and export deliberate public operations.
- Preserve preview-before-save: wiki writes require the user to choose Save
  and use the exact reviewed talk-page lead and new-page-list text.
- Treat page targeting, edit summaries, conflict handling, and API writes as
  sensitive behavior. Retry only confirmed talk-page edit conflicts after
  refetching; report uncertain outcomes and registration conflicts.
- Render source and translated content as text. Ignore stale asynchronous
  results and release mounted UI when closing or canceling.
- Inject logging and notifications; keep all three locale catalogs aligned.
- Follow Wikimedia Codex form and accessibility guidelines. Keep template,
  TypeScript behavior, and scoped CSS together for each UI component.
- Use the tracked lockfile and Node.js 24.14.1 or newer. Run `npm run verify`
  for material changes. Tests are offline and never mutate live MediaWiki.
- Generate `dist/` through the build. Keep product guidance in the README,
  technical depth in `docs/`, and notable changes in `CHANGELOG.md`.
- Preserve the CC0 dedication and third-party licensing limits.
