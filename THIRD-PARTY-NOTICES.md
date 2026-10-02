# Third-party notices

<!-- toc:start -->

## Contents

- [Wikimedia namespace data](#wikimedia-namespace-data)
- [Host runtimes and development dependencies](#host-runtimes-and-development-dependencies)
- [Documentation article fixture](#documentation-article-fixture)

<!-- toc:end -->

## Wikimedia namespace data

English and Chinese Wikipedia namespace names and aliases in
`src/domain/wiki-titles.ts` retain their applicable Wikimedia project status
and terms. The CC0 dedication does not relicense externally sourced data.
See the [Wikimedia Terms of Use][1].

## Host runtimes and development dependencies

Vue and Wikimedia Codex are provided by the host wiki's ResourceLoader in
production. They are installed locally for types and offline browser tests;
their package licenses remain applicable. Development tools retain the
licenses distributed with their locked packages. Production artifacts do
not bundle those package runtimes.

[1]: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use

## Documentation article fixture

The offline documentation fixtures use [BanG Dream! 少女樂團派對, revision 94028176](https://zh.wikipedia.org/w/index.php?title=BanG%20Dream!%20%E5%B0%91%E5%A5%B3%E6%A8%82%E5%9C%98%E6%B4%BE%E5%B0%8D&oldid=94028176) by the [Wikipedia contributors](https://zh.wikipedia.org/w/index.php?title=BanG%20Dream!%20%E5%B0%91%E5%A5%B3%E6%A8%82%E5%9C%98%E6%B4%BE%E5%B0%8D&action=history), under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The pinned article code is in `tests/fixtures/bang-dream.wikitext`; provenance is in the adjacent `bang-dream.source.json`.

Screenshots display selected article-code excerpts or a simplified text rendering of its opening paragraph. Images, references, and templates are omitted from the simplified rendering. Nomination recipients, scores, talk-page banners, category membership, and API responses are simulated examples. They do not describe a live nomination or assessment. No live wiki edits are performed.
