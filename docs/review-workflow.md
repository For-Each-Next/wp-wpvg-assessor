# Review workflow

The gadget opens from the page tools on Chinese Wikipedia. It resolves the
subject and talk titles, reads the subject's creation information, loads the
talk-page lead and new-page list, and prepares registration before showing
the form. Successful reads and in-flight loads are reused on subsequent
openings. A staged page restores its reviewed source and summaries. When
moving to another page in the same tab, the shared list snapshot and cached
creation times are reused.

Registration ordering reads run only when the article needs a new list entry.
An explicitly missing peer page has no known creation date; its existing list
entry remains in the proposed source. Missing peer metadata does not prevent
the assessment form from opening. Unreadable revisions on existing pages
still stop loading, and the current subject must have readable source and a
creation date.

## Assessment and review

Existing banner values initialize the controls. Uncommon class values display
in the editable input, and uncommon importance values remain selectable when
they are already in the source. Task forces, maintenance flags, and related
projects are optional.

The shared class uses an editable Codex combobox. Its default menu shows common
classes, while other known grades and custom codes can be entered directly.
`Bplus` and `b+` normalize to `B+`, displayed as 乙上 in Chinese. Less common
grades such as D, B+, A, and FL stay out of the menu even when they are the
current class; their localized labels remain visible in the input.

The **Out of scope** importance choice removes existing Video
games banner aliases and omits that banner from the proposed shell. Video
games task forces, maintenance flags, and new-page registration become
unavailable. The shared `{{WPBS}}` class and other project selections remain
editable; a class-only shell is also supported. Existing shells and recognizable
secondary project banners without a Video games banner initialize this
choice, so changing their class does not add a Video games banner.

Changing a control updates the proposed talk-page lead. You can also edit
that source directly. Recognizable source changes update the controls, and
later control changes preserve untouched source where possible. The
comparison shows the current source beside the exact proposed lead.

Banner transformations retain unrelated shell settings, including `vital=yes`,
and move recognizable standalone project banners into the shell's `|1=` body.
Only confirmed retired Video games parameters are removed automatically;
supported and custom parameters on project banners remain in the reviewed
source. The supplied 宝可梦系列 example exercises this cleanup with existing
Pokémon, Nintendo, ACG, and Japan assessments.

The edit-summary field controls the talk-page summary. If the article is
eligible for registration, select the registration checkbox to review its
separate list comparison and summary. Already registered and older articles
show their eligibility explanation.

Manually removing the Video games banner also clears the registration
selection. Registration requires the exact reviewed lead to contain a
recognizable Video games assessment, and the save workflow ignores stale
registration selections when the assessment is outside that project.

Choosing **Submit** freezes the controls while the requested saves run. Closing
or canceling before saving leaves the wiki unchanged. Successful completion
refreshes the current page.

## Background drafts and batch submission

**Stage (暂存)** immediately adds the current page's draft to the shared queue
and keeps the dialog open without a wiki write. The same button becomes
**Unstage (取消暂存)** for a
queued page. Unstaging removes only that page, discards any prepared batch,
and keeps the current form edits available. Staging again captures those
edits as a new draft. The draft captures the exact reviewed lead,
assessment choices, summaries, and registration selection. Drafts use browser
`localStorage` per wiki and account, surviving navigation, reloads, and closing
tabs. Clicking Submit is not needed to enqueue a staged draft. Any browser
tab using that wiki and account can submit the queue. Open dialogs update
their queue counts and Stage/Unstage button when another tab changes the
queue, keeping the current form edits. Storage failures keep the dialog open
with an error.

The existing submit action shows **Submit (+N)** for the other queued pages;
the current page is included once even if it has already been staged. With
pending drafts, the first submit action refreshes the list once and prepares
one registration change for the entire batch. The dialog presents that
combined comparison and editable list summary together with the other
pages' reviewed talk leads and summaries. The next submit action writes
those exact reviewed values. Changing assessment controls, source, summaries,
or registration selection requires another batch review.
Changes to the queue in another tab also invalidate a prepared or in-flight
batch review, requiring a fresh combined preview.

Canceling batch preparation ignores its late results and leaves the queued
drafts intact. Submission checks that the queued drafts still match the
reviewed batch. It writes registration once, then saves each talk assessment
with the existing talk-save workflow. Confirmed completion removes that
page from the queue; a failure retains unfinished pages. Once registration
has been confirmed, remaining drafts no longer request registration on retry.
Registration conflicts and uncertain outcomes stop the batch and require a
fresh review instead of an automatic retry.

Queue changes and batch submission use the same exclusive Web Lock for the
wiki and account. After acquiring it, submission checks that the queued
drafts still match the reviewed batch. This prevents a waiting tab from
submitting a batch already completed elsewhere. Staging during another tab's
submission waits for that save to finish, then adds the captured draft to the
remaining queue. Cached page reads stay in session storage and cannot
overwrite the shared queue. Staged drafts are restored exclusively from the
shared `localStorage` queue; the separate per-tab cache stores read snapshots.

## Category assessment

On the unassessed Video games category, the page-tool action becomes
**Batch assess articles (批量评级条目)**. The category interface uses a nearly
full-screen sandboxed frame to show the rendered article, with one Codex
action row below it, arranged into three button groups:
[Stub | Start | D | C | B], [SL | List | CL | BL], [Unassessed | Skip].
Article source and proposed talk-page source remain text in assessment
controls and comparisons.

The frame reuses the host wiki's loaded inline CSS and same-origin stylesheet
links. Its MediaWiki content wrappers also support the article's embedded
TemplateStyles, which scope their rules under `.mw-parser-output` as described
in the [TemplateStyles documentation](https://www.mediawiki.org/wiki/Help:TemplateStyles).
The sandbox permits stylesheet loading while blocking scripts.

The workflow reads category members through API continuation. Main-namespace
members and talk-namespace members resolve to the same subject/talk target
pair. It loads article previews and assessment-only state for the current
article and the next three articles, refilling that window as the user moves
forward. These category loads read the talk-page lead without fetching the
new-page registration list or page creation dates. The ordinary article
assessor continues to load those registration details. Late results from a
closed interface do not update mounted UI.

Expand **Review proposed talk-page lead** to inspect the proposed source and
edit its talk-page summary before acting. Choosing a class button applies
that class, generates the corresponding lead through the ordinary assessment
rules, and starts saving the captured lead and summary in the background
through the ordinary safe-save workflow. Other assessment flags and a
manually entered summary are preserved; new-page registration is disabled.
The class action immediately advances to the next article without waiting
for the save or showing a save spinner. The existing talk-page conflict
handling applies.

A failed or uncertain save queues that article after the remaining category
pages. When it returns, the interface restores the captured exact source and
summary and shows the save error. It does not automatically retry a failed
article; choosing a class again explicitly starts another save. At the end
of the category, the interface shows the number of pending background saves,
and failed articles appear as those saves settle.

**Skip** moves to the next article without a wiki write. Category assessment
does not stage drafts or submit the shared queue. **Cancel** is available
during reading and loading, ignores late UI loads, and releases the mounted
interface. Background saves continue after closing. The workflow retains
failed articles and their captured reviews in memory, making them available
when the form is reopened in the same tab and gadget runtime; reloading does
not restore this retry queue. If article loading fails, **Retry** loads the
current article again.

## Conflicts and failures

Registration uses the reviewed list snapshot and timestamps. A registration
conflict stops the transaction so that the list can be opened and reviewed
again.

Talk-page saves refetch the latest page and replace its lead with the reviewed
lead while retaining the discussion body. Only a confirmed `editconflict`
is retried, at most three times, with a fresh fetch on each attempt. Network
errors and other uncertain results stop and remain visible.

Existing pages require readable revision content and a base timestamp. A
missing or hidden revision stops the workflow instead of being treated as
empty source. Writes are reported as saved only after an explicit successful
edit response from MediaWiki.

Registration and talk-page assessment are separate wiki edits. If registration
succeeds and the talk edit fails, registration remains saved. Inspect the
latest wiki state before retrying; reopening reads the current state.

Automated verification exercises these behaviors with local fixtures. It does
not establish compatibility with every deployed wiki extension or skin.
