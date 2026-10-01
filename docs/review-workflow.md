# Review workflow

The gadget opens from the page tools on Chinese Wikipedia. It resolves the
subject and talk titles, reads the subject's creation information, loads the
talk-page lead and new-page list, and prepares registration before showing
the form. Successful reads and in-flight loads are reused on subsequent
openings. A staged page restores its reviewed source and summaries. When
moving to another page in the same tab, the shared list snapshot and cached
creation times are reused.

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

**Stage (暂存)** adds the current page's draft and keeps the dialog open
without a wiki write. The same button becomes **Unstage (取消暂存)** for a
queued page. Unstaging removes only that page, discards any prepared batch,
and keeps the current form edits available. Staging again captures those
edits as a new draft. The draft captures the exact reviewed lead,
assessment choices, summaries, and registration selection. Drafts use browser
session storage per wiki and account, surviving navigation and reloads in
the same tab. Storage failures keep the dialog open with an error.

The existing submit action shows **Submit (+N)** for the other queued pages;
the current page is included once even if it has already been staged. With
pending drafts, the first submit action refreshes the list once and prepares
one registration change for the entire batch. The dialog presents that
combined comparison and editable list summary together with the other
pages' reviewed talk leads and summaries. The next submit action writes
those exact reviewed values. Changing assessment controls, source, summaries,
or registration selection requires another batch review.

Canceling batch preparation ignores its late results and leaves the queued
drafts intact. Submission checks that the queued drafts still match the
reviewed batch. It writes registration once, then saves each talk assessment
with the existing talk-save workflow. Confirmed completion removes that
page from the queue; a failure retains unfinished pages. Once registration
has been confirmed, remaining drafts no longer request registration on retry.
Registration conflicts and uncertain outcomes stop the batch and require a
fresh review instead of an automatic retry.

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
