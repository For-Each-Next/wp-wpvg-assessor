# WPVG Assessor

[English](README.md) · [繁體中文](README.zh-Hant.md) · [简体中文](README.zh-Hans.md)

在中文维基百科评定电子游戏条目，并将符合资格的条目登记至专题新进条目列表。

<!-- toc:start -->

## 目录

- [主要功能](#主要功能)
- [安装](#安装)
- [使用方式](#使用方式)
- [画面示例](#画面示例)
- [说明](#说明)
- [许可](#许可)

<!-- toc:end -->

## 主要功能

- 从现有讨论页横幅载入质量、重要度、任务组与维护标记。
- 提交前检查可编辑的预定源代码、差异与独立编辑摘要。
- 跨标签页暂存草稿，一次提交多篇已检查的评级。
- 以条目预览进行分类批次评级，后台保存并明确重试失败项目。

## 安装

安装可阅读的 [Tampermonkey 用户脚本](https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.user.js)，或将最新 [MediaWiki 小工具](https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.min.js) 内容粘贴至中文维基百科的 `Special:MyPage/common.js`。选择一种安装方式后重新加载页面；提交使用当前登录的维基账号。[版本列表](https://github.com/For-Each-Next/wp-wpvg-assessor/releases)。

移除工具时，停用 Tampermonkey 中对应的脚本，或从 `common.js` 删除工具代码，再重新加载维基百科。

## 使用方式

打开条目或讨论页，在页面工具中选择 **电子游戏页面评级工具**。设置评级，核对讨论页源代码与编辑摘要后选择 **提交**。只有符合资格的条目才会提供新进条目登记。

选择 **暂存** 可保留草稿并继续浏览其他页面。**取消暂存** 从队列移除草稿，但保留当前的表单修改。**提交 (+N)** 打开整批检查，再按一次 **提交** 才保存已检查的内容。

在[未评级电子游戏条目分类](https://zh.wikipedia.org/wiki/Category:未评级电子游戏条目)选择 **批量评级条目**。阅读条目预览，必要时展开预定讨论页源代码。**选择质量等级会立即保存该次评级，并移至下一篇。** **跳过** 不保存；**取消** 关闭界面，已开始的保存仍会完成。失败项目保留在同一标签页供重试，直到重新加载。

## 画面示例

以下离线画面取材自 **BanG Dream! 少女樂團派對** 条目源代码（版本 94028176）；得分者、分数、评级横幅与 API 结果均为示例数据，不代表实际评定。

![评级选项](docs/images/screenshot-01.png)

![预定讨论页源代码](docs/images/screenshot-02.png)

![分类评级](docs/images/screenshot-03.png)

[来源署名与修改说明](THIRD-PARTY-NOTICES.md#documentation-article-fixture).

## 说明

资格、暂存、批次操作与冲突恢复详见[检查流程](docs/review-workflow.md)。界面依维基百科语言设置显示英文、繁体中文或简体中文。

开发信息见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

项目自有内容依 [CC0 1.0](LICENSE) 发布。维基媒体内容与外部软件包保留各自条款。另见[第三方声明](THIRD-PARTY-NOTICES.md)。
