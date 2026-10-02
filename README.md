# WPVG Assessor

[English](README.md) · [繁體中文](README.zh-Hant.md) · [简体中文](README.zh-Hans.md)

Assess video-game articles on Chinese Wikipedia and register eligible articles on the WikiProject new-page list.

<!-- toc:start -->

## Contents

- [Features](#features)
- [Installation](#installation)
- [How to use](#how-to-use)
- [Screenshots](#screenshots)
- [Help](#help)
- [License](#license)

<!-- toc:end -->

## Features

- Choose class, importance, task forces, and maintenance flags from the existing talk-page banners.
- Review editable proposed source, highlighted changes, and separate edit summaries before submitting.
- Stage drafts across browser tabs and submit several reviewed assessments together.
- Assess a category with article previews, background saves, and explicit retry for failed articles.

## Installation

Install the readable [Tampermonkey userscript](https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.user.js), or copy the latest [MediaWiki gadget](https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.min.js) into your Chinese Wikipedia `Special:MyPage/common.js`. Choose one installation method, then reload Wikipedia. Submissions use your logged-in wiki account. [All releases](https://github.com/For-Each-Next/wp-wpvg-assessor/releases).

To remove the tool, disable its Tampermonkey entry or remove its code from `common.js`, then reload Wikipedia.

## How to use

Open an article or its talk page and choose **VG Page Assessor** from the page tools. Set the assessment, review the proposed talk-page source and edit summaries, then choose **Submit**. New-page registration is offered only for eligible articles.

Choose **Stage** to keep a reviewed draft across page navigation. **Unstage** removes it from the queue while retaining current form edits. **Submit (+N)** opens the combined batch review; a second **Submit** saves the reviewed changes.

On [Category:未评级电子游戏条目](https://zh.wikipedia.org/wiki/Category:未评级电子游戏条目), choose **Batch assess articles**. Read the article preview and expand **Review proposed talk-page lead** when needed. **Choosing a class saves that assessment immediately and advances to the next article.** **Skip** advances without saving. **Cancel** closes the interface while pending saves finish. Failed reviews remain available in the same tab until reload.

## Screenshots

Offline examples based on the article source of **BanG Dream! 少女樂團派對** (revision 94028176). Recipients, scores, banners, and API results are simulated; screenshots do not claim a live assessment.

![Assessment choices](docs/images/screenshot-01.png)

![Proposed talk-page source](docs/images/screenshot-02.png)

![Category assessment](docs/images/screenshot-03.png)

[Source attribution and modifications](THIRD-PARTY-NOTICES.md#documentation-article-fixture).

## Help

See the [review workflow](docs/review-workflow.md) for eligibility, staged drafts, category actions, and conflict recovery. The interface follows your Wikipedia language: English, Traditional Chinese, or Simplified Chinese.

Contributor information is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Project-owned material is dedicated under [CC0 1.0](LICENSE). Wikimedia content and external packages retain their own terms. See [third-party notices](THIRD-PARTY-NOTICES.md).
