# Screenshots

<!-- toc:start -->

## Contents

- [Capture](#capture)
- [Source and simulation](#source-and-simulation)
- [Image inventory](#image-inventory)
- [Test ownership](#test-ownership)

<!-- toc:end -->

## Capture

Run `npm run screenshots` to build and exercise the real interface in Chromium.
Documentation scenarios run only with `DOCUMENTATION_SCREENSHOTS=1` and use a
1024 × 768 CSS-pixel viewport, device scale factor 1, and disabled animations.
The command writes full viewport images to `docs/images/`. Inspect each image for
visible labels, action hierarchy, clipping, and accidental loading states.
Normal verification does not replace documentation images.

## Source and simulation

The pinned article is **BanG Dream! 少女樂團派對**, revision **94028176**.
`tests/fixtures/bang-dream.wikitext` stores its full original source, and
`tests/fixtures/bang-dream.source.json` records the title, revision, source and
history links, and license. See [third-party notices](../THIRD-PARTY-NOTICES.md#documentation-article-fixture)
for attribution and CC BY-SA 4.0 terms.

The category preview renders a simplified opening paragraph directly from the
pinned source and displays an infobox-code excerpt. Templates, references, and
images are omitted from the simplified rendering. Talk-page banners, category
membership, and assessments are simulated examples rather than current wiki data.

All MediaWiki responses and edits are local fixtures. Browser tests reject unexpected
network requests and assert that the screenshot scenarios perform no saves.

## Image inventory

| Image               | Captured behavior                                                    |
| ------------------- | -------------------------------------------------------------------- |
| `screenshot-01.png` | Assessment class, importance, task forces, and related projects.     |
| `screenshot-02.png` | Exact proposed talk-page source and changes before submission.       |
| `screenshot-03.png` | Category article preview, class actions, and source-review controls. |

## Test ownership

`tests/ui/screenshots.spec.ts` owns the opt-in documentation scenarios. The fixture
server supplies the built gadget, local Vue/Codex runtime, and in-memory MediaWiki
adapters. All three user READMEs share these images. `scripts/test-ui.mjs` removes
temporary Playwright reports when it exits.
