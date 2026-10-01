# WPVG Assessor

A standalone Chinese Wikipedia gadget for assessing video-game articles and
registering eligible articles on the WikiProject new-page list.

This tool is early-development software. In the regular assessor, review the
proposed talk-page source and any list changes before choosing **Submit**.
In category assessment, choosing a class starts a background save and
immediately moves to the next article.

## Features

![宝可梦系列 assessment and the complete talk-page review](docs/images/screenshot-long.png)

Example: [宝可梦系列](https://zh.wikipedia.org/wiki/宝可梦系列), using its supplied
talk-page banners.

[View the stacked layout for narrower screens](docs/images/screenshot-narrow.png).

### Assessment

- Class and importance choices, task forces, maintenance flags, and related
  WikiProject banners, initialized from the existing talk page.
- An editable **Shared class** combobox for common choices and other class
  codes. `Bplus` and `b+` are recognized as B+ (乙上 in Chinese); less common
  classes stay out of the menu and can be entered directly.
- An **Out of scope** importance choice that removes or omits the
  Video games banner and disables its tags and new-page registration. The
  shared WPBS class remains editable for other projects or class-only
  reassessment.
- Editable proposed source and highlighted changes to review before saving.
- Existing discussion sections and unrelated lead content preserved.
- Existing banner-shell settings such as `vital=yes` preserved while project
  banners are merged into the shell and retired Video games parameters are
  removed.

### New-page registration

- Registration of eligible articles on the WikiProject new-page list, with
  creation dates and ordering handled automatically.
- A separate change preview and edit summary before registration.
- Clear explanations when an article is already listed or outside the
  registration period.
- A **Stage (暂存)** button that queues reviewed pages in the background.
  The queue uses `localStorage` and is shared across browser tabs for the same
  wiki and account. The same **Submit (+N)** button includes the other queued
  pages and combines their registrations into one list edit.

### Category assessment

- **Batch assess articles (批量评级条目)** on
  [Category:未评级电子游戏条目](https://zh.wikipedia.org/wiki/Category:未评级电子游戏条目).
- A nearly full-screen article preview with wiki and template styles above
  three compact button groups:
  [Stub | Start | D | C | B], [SL | List | CL | BL], [Unassessed | Skip].
- The next three article previews and assessment forms load ahead as you
  work through the category. Category loads read the talk-page assessment
  directly, without new-page registration or creation-date requests.
- Choosing a class starts saving the current article's talk-page assessment
  in the background and moves on immediately. **Skip** moves on without a
  wiki write. Failed articles return after the remaining category pages for
  inspection and an explicit retry.

The interface uses English, Simplified Chinese, or Traditional Chinese,
according to your Wikipedia interface language.

## How to use

Copy the contents of [wpvg_assessor.min.js](https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.min.js) into
`Special:MyPage/common.js` on Chinese Wikipedia, or add it as a site gadget.
Tampermonkey users can install [wpvg_assessor.user.js](https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.user.js) instead.

Both links download the files from the latest GitHub release.

Refresh Wikipedia after installation, open an article or its talk page, and
choose **VG Page Assessor** from the page tools. Select the assessment, review
the proposed source and changes, and choose **Submit**. New-page registration
is available when the article meets the configured eligibility rules.

To assess several pages together, choose **Stage (暂存)** after reviewing each
page. This adds the draft to the shared queue immediately; you can continue
on another page or browser tab. Staging keeps
the form open and changes the same button to **Unstage (取消暂存)**. Choose it
to remove the current page from the queue while retaining the edits in the
form. These actions do not edit Wikipedia. Reopening restores
the staged source and summaries and reuses loaded page data. **Submit (+3)**
means the current page will be submitted with three other staged pages.
Choose it to review the combined batch, then choose **Submit** again to save
the reviewed changes. You can submit the queue from any browser tab using
the same wiki and account. Drafts remain in `localStorage` across navigation,
reloads, and closing tabs, and are removed as their submissions finish
successfully. Open dialogs update their queued-page counts when another tab
stages or unstages a page.

On **Category:未评级电子游戏条目**, choose **Batch assess articles
(批量评级条目)** from the page tools. Read the article preview and expand
**Review proposed talk-page lead** to inspect the source and edit summary.
Choose a class button below the preview to apply that class and immediately
start saving its talk-page assessment in the background. The action preserves
the other assessment settings and any summary you entered, and moves to the
next article without waiting for the save. **Skip**, grouped with
**Unassessed**, advances without a wiki write. Three articles ahead are
preloaded as you navigate.

An article whose save fails returns after the remaining category pages, with
the captured source, summary, and error. Inspect it and choose a class again
to retry explicitly, or choose **Skip**. At the end, the form shows how many
background saves are still pending and displays failed articles as they
arrive. **Cancel** closes the form during reading or loading while those
saves finish in the background. Failed articles remain available when you
reopen the form in the same tab; this retry state lasts until the page is
reloaded. If an article cannot load, **Retry** loads it again.

For a page outside WikiProject Video games, choose **Out of scope**
under **Importance**. You can still set the shared class and select other
projects, such as ACG. Existing banner shells and recognizable project banners
without a Video games banner start with this choice selected.

The gadget runs only on Chinese Wikipedia. Install just one of these files.

## License

Project-owned material is dedicated under [CC0 1.0][1]. Wikimedia data and
external packages retain their terms; see [third-party notices][2].

[1]: LICENSE
[2]: THIRD-PARTY-NOTICES.md
