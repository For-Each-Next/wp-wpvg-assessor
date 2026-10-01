# Changelog

## 0.2.1 - 2026-10-01

- Fixed talk-page loading when the same date in the new-page list contains
  a missing page, including `Talk:COCORO`. Skip ordering reads for already
  registered or ineligible articles, and retain missing list entries with
  unknown creation dates when preparing a new registration.
- Added **Batch assess articles (批量评级条目)** on the unassessed Video games
  category, with a nearly full-screen article preview using wiki and template
  styles and three compact button groups: article classes, list classes,
  and Unassessed/Skip. Load only talk-page assessment data, avoiding new-page
  registration and creation-date requests in category assessment. Preload
  the next three articles; choosing a class starts a background talk-page
  save and immediately advances. **Skip** continues without a wiki write.
  Failed articles return after the remaining category pages with their
  captured source, summary, and error for explicit retry. Pending saves
  continue after closing the form; failures remain available on reopening
  in the same tab until reload.

- Store staged assessments immediately in `localStorage`, sharing the queue
  across browser tabs for the same wiki and account. Update open dialogs when
  the queue changes, retain local form edits, and require a fresh batch review
  after external changes. Serialize queue changes and submission across tabs
  to prevent duplicate saves or overwritten drafts.
- Removed draft migration from the older per-tab store. Restore staged drafts
  exclusively from the shared `localStorage` queue.

## 0.2.0 - 2026-10-01

- Linked the MediaWiki gadget and userscript installation instructions to
  GitHub's latest release downloads.

## 0.1.1 - 2026-10-01

- Renamed the outside-project importance choice to **Out of scope**.
- Keep the form open after staging and switch the same button to **Unstage**
  for a queued page. Unstaging removes only the current draft
  and retains the edits in the form.
- Applied the assessment footer button order and hierarchy: quiet destructive
  Cancel, normal neutral Stage, and primary progressive Submit. Added the
  required Codex button guidance to the contributor documentation.
- Added **Stage** to queue reviewed assessments in the background and
  **Submit (+N)** to review and submit them together. Batched registration
  uses one fresh list preview and one list edit; unfinished drafts survive
  partial failures. Reopening reuses page data and restores staged source.

## 0.1.0 - 2026-10-01

- Preserve banner-shell settings such as `vital=yes`, merge standalone project
  banners into the shared shell, and remove confirmed retired Video games
  parameters while retaining supported and custom banner settings.
- Added a **Not a video game article** importance choice to remove or omit
  the Video games banner and disable its tags and new-page registration,
  while retaining the shared WPBS class and other-project assessment.
- Added an editable shared-class combobox with `Bplus`/`b+` recognition and
  simplified the dialog header and guidance.
- Added a self-contained project with separate application, domain, platform,
  feature, and shared responsibilities.
- Added independent minified MediaWiki and readable userscript artifacts,
  with Vue and Codex supplied by the host wiki.
- Reworked the assessment form using Wikimedia Codex selectors, visible
  labels, optional groups, review guidance, and responsive styles.
- Added banner parsing, manual source review, timestamp-protected saving,
  and Chinese Wikipedia new-page registration.
- Added a standalone lockfile and offline unit, service, and browser checks.
- Require readable revision content and a base timestamp for existing pages,
  and report success only when MediaWiki confirms that an edit was saved.
