/**
 * @file tests/assessment.test.ts
 * Purpose: Characterizes talk-page assessment transformations.
 *
 * Table of contents:
 * 1. Imports
 * 2. Test scenarios
 */

import assert from "node:assert/strict";
import test from "node:test";

import projectConfig from "../src/domain/project-config.ts";
import {
    createDefaultAssessment,
    getExistingOtherProjectOptions,
    getTalkPageTopSection,
    hasDykInviteAtTop,
    normalizeAssessmentClass,
    parseAssessment,
    previewTalkPageTopSection,
    updateTalkPageAssessment,
    updateTalkPageTopSection,
} from "../src/domain/assessment.ts";
import { NOT_VIDEO_GAME_IMPORTANCE } from "../src/domain/types.ts";

test("recognizes a DYK invite only among leading talk-page templates", () => {
    assert.equal(
        hasDykInviteAtTop(
            "{{Talk header}}\n{{template:dyk_invite|date=2026-08-14}}",
        ),
        true,
    );
    assert.equal(
        hasDykInviteAtTop(
            "{{Talk header}}\n\n== Discussion ==\n{{DYK Invite}}",
        ),
        false,
    );
});

test("preserves custom assessment values from recognizable source", () => {
    const source = [
        "{{WikiProject banner shell|class=Future|1=",
        "{{WikiProject Video games|importance=Critical}}",
        "}}",
    ].join("\n");
    const parsed = parseAssessment(projectConfig, source);

    assert.ok(parsed);
    assert.equal(parsed.className, "Future");
    assert.equal(parsed.importance, "Critical");
    assert.equal(parseAssessment(projectConfig, "{{Unmanaged}}"), null);
});

test("normalizes Bplus and B+ class aliases from shared and VG banners", () => {
    const aliases = ["Bplus", "bplus", "BPLUS", "b+", "B+"];

    for (const alias of aliases) {
        const sources = [
            `{{WPBS|class=${alias}|1={{WPVG|importance=Low}}}}`,
            `{{WPVG|class=${alias}|importance=Low}}`,
        ];

        for (const source of sources) {
            const parsed = parseAssessment(projectConfig, source);

            assert.ok(parsed);
            assert.equal(parsed.className, "B+", source);
        }
        assert.equal(normalizeAssessmentClass(`  ${alias}  `), "B+");
    }

    assert.equal(normalizeAssessmentClass("  Future  "), "Future");
    assert.equal(normalizeAssessmentClass("  start  "), "Start");
    assert.equal(normalizeAssessmentClass("  "), null);
    assert.equal(normalizeAssessmentClass(null), null);
});

test("keeps new-page VG defaults and parses a shared class without a VG banner", () => {
    assert.equal(createDefaultAssessment(projectConfig).importance, "");
    assert.equal(
        createDefaultAssessment(projectConfig, "{{Talk header}}\nLead text")
            .importance,
        "",
    );

    const source = "{{WPBS|class=b}}";
    const assessment = parseAssessment(projectConfig, source);

    assert.ok(assessment);
    assert.equal(assessment.className, "B");
    assert.equal(assessment.importance, NOT_VIDEO_GAME_IMPORTANCE);
    assessment.className = "C";

    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.equal(result, "{{WikiProject banner shell|class=C|1=\n}}");
    assert.equal(
        parseAssessment(projectConfig, result)?.importance,
        NOT_VIDEO_GAME_IMPORTANCE,
    );
    assert.equal(
        updateTalkPageAssessment(result, assessment, projectConfig),
        result,
    );
});

test("can add only ACG while assigning a shared class", () => {
    const assessment = createDefaultAssessment(projectConfig);

    assessment.className = "Start";
    assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;
    assessment.otherProjects.acg = true;
    assessment.taskForces.pokemon = true;
    assessment.maintenance.reassess = true;

    const result = updateTalkPageAssessment("", assessment, projectConfig);

    assert.equal(
        result,
        "{{WikiProject banner shell|class=Start|1=\n{{ACG專題}}\n}}\n",
    );
    assert.doesNotMatch(result, /importance|Pokemon|reassess|NotVG/u);
});

test("recognizes and preserves a standalone secondary project's assessment", () => {
    const banner =
        "{{WPACG|class=c|importance=High|custom={{Keep|value=yes}}}}";
    const source = `${banner}\n\n== Discussion ==\nKeep this discussion.`;
    const assessment = parseAssessment(projectConfig, source);

    assert.ok(assessment);
    assert.equal(assessment.className, "C");
    assert.equal(assessment.importance, NOT_VIDEO_GAME_IMPORTANCE);
    assert.equal(assessment.otherProjects.acg, true);
    assessment.className = "B";

    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        `{{WikiProject banner shell|class=B|1=\n${banner}\n}}\n\n== Discussion ==\nKeep this discussion.`,
    );
});

test("removes a deselected standalone secondary banner without changing retained source", () => {
    const acg = "{{WPACG|class=C|custom={{Keep|value=yes}}}}";
    const biography = "{{WikiProject Biography|living=yes|custom=Keep}}";
    const source = `${acg}\n${biography}\n\n== Discussion ==\nKeep this discussion.`;
    const assessment = createDefaultAssessment(projectConfig, source);

    assessment.otherProjects.acg = false;

    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        `{{WikiProject banner shell|class=C|1=\n${biography}\n}}\n\n== Discussion ==\nKeep this discussion.`,
    );
});

test("removes all configured VG aliases while preserving other projects and lead content", () => {
    const aliases = [
        "WikiProject Video games",
        "電子遊戲專題",
        "电子游戏专题",
        "WPVG",
        "WikiProject Square Enix",
        "WikiProject Electronic games",
        "模板:WPVG",
    ];
    const standaloneAcg = "{{WPACG|custom=yes}}";
    const nestedMusic = "{{音樂專題|importance=High|custom=yes}}";
    const nestedOther = "{{WikiProject Role-playing games|custom=yes}}";
    const source = [
        "{{Talk header}}",
        ...aliases.map((alias) => `{{${alias}|class=B|importance=Low}}`),
        standaloneAcg,
        "{{WikiProject banner shell|class=B|1=",
        nestedMusic,
        ...aliases.map((alias) => `{{${alias}|importance=Low|SEGA=yes}}`),
        nestedOther,
        "}}",
        "{{Unmanaged banner|custom=yes}}",
        "Lead text with {{WPVG}} mentioned outside an assessment banner.",
        "",
        "== Discussion ==",
        "Keep {{WPVG}} in this discussion exactly.",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);

    assert.equal(assessment.importance, "Low");
    assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;
    assessment.className = "C";

    const result = updateTalkPageAssessment(source, assessment, projectConfig);
    const expected = [
        "{{Talk header}}",
        "{{WikiProject banner shell|class=C|1=",
        standaloneAcg,
        nestedMusic,
        nestedOther,
        "}}",
        "{{Unmanaged banner|custom=yes}}",
        "Lead text with {{WPVG}} mentioned outside an assessment banner.",
        "",
        "== Discussion ==",
        "Keep {{WPVG}} in this discussion exactly.",
    ].join("\n");

    assert.equal(result, expected);
    const reparsed = parseAssessment(projectConfig, result);

    assert.ok(reparsed);
    assert.equal(reparsed.importance, NOT_VIDEO_GAME_IMPORTANCE);
    assert.equal(
        updateTalkPageAssessment(result, reparsed, projectConfig),
        result,
    );

    reparsed.importance = "Mid";
    const restored = updateTalkPageAssessment(result, reparsed, projectConfig);

    assert.match(restored, /\{\{WikiProject Video games\|importance=Mid\}\}/u);
    assert.match(restored, /\{\{WPACG\|custom=yes\}\}/u);
});

test("preserves unmanaged banners and talk-page discussion content", () => {
    const source = [
        "{{WikiProject banner shell|class=B|1=",
        "{{WikiProject Anime}}",
        "{{WikiProject Video games|importance=Low|Sega=yes}}",
        "}}",
        "{{Unmanaged banner|custom=yes}}",
        "",
        "== Discussion ==",
        "Keep this discussion exactly.",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig);

    assessment.className = "Start";
    assessment.importance = "Mid";
    assessment.taskForces.pokemon = true;

    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.match(result, /\{\{WikiProject Anime\}\}/u);
    assert.match(result, /\{\{Unmanaged banner\|custom=yes\}\}/u);
    assert.match(
        result,
        /\{\{WikiProject Video games\|importance=Mid\|Pokemon=yes\}\}/u,
    );
    assert.doesNotMatch(result, /Sega=yes/u);
    assert.equal(
        result.slice(result.indexOf("== Discussion ==")),
        "== Discussion ==\nKeep this discussion exactly.",
    );
});

test("recognizes zhwiki template namespace aliases", () => {
    const source = [
        "{{T:WikiProject banner shell|class=B|1=",
        "{{樣板:WikiProject Anime}}",
        "{{模板:WikiProject Video games|importance=Low|Sega=yes}}",
        "}}",
        "",
        "== Discussion ==",
        "Body",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig);

    assessment.className = "C";
    assessment.importance = "High";
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.match(result, /\{\{樣板:WikiProject Anime\}\}/u);
    assert.match(
        result,
        /\{\{模板:WikiProject Video games\|importance=High\}\}/u,
    );
    assert.doesNotMatch(result, /Sega=yes/u);
});

test("reassesses a shell after unmanaged lead templates in place", () => {
    const source = [
        "{{DYKtalk|date=2026-07-26}}",
        "{{WikiProject banner shell|class=Unassessed|1=",
        "{{WikiProject Electronic games|MiHoYo=yes|importance=low}}",
        "{{WikiProject Fictional characters}}",
        "}}",
        "{{Refideas|{{cite web|title=Source|url=https://example.com}}}}",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);

    assert.equal(assessment.className, "Unassessed");
    assert.equal(assessment.importance, "Low");
    assert.equal(assessment.taskForces.mihoyo, true);
    assert.equal(assessment.otherProjects.fictionalCharacters, true);

    assessment.className = "B";

    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        source.replace("class=Unassessed", "class=B"),
    );
});

test("moves a standalone Articles for creation banner into the shell", () => {
    const articlesForCreation = [
        "{{WikiProject Articles for creation|class=start",
        "|ts=20260814090210|reviewer=断岸千尺|oldid=93888495}}",
    ].join("");
    const source = [
        articlesForCreation,
        "{{WikiProject Video games|class=start}}",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const expected = [
        "{{WikiProject banner shell|class=Start|1=",
        articlesForCreation,
        "{{WikiProject Video games|importance=}}",
        "}}",
    ].join("\n");
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.equal(assessment.className, "Start");
    assert.equal(result, expected);
    assert.equal(
        updateTalkPageAssessment(result, assessment, projectConfig),
        expected,
    );
});

test("integrates the standalone AfC and duplicate video-game fixture", () => {
    const articlesForCreation =
        "{{WikiProject Articles for creation|class=start|" +
        "ts=20260814090210|reviewer=断岸千尺|oldid=93888495}}";
    const standalone = "{{WikiProject Video games|class=start}}";
    const nested = "{{WikiProject Video games|importance=}}";
    const source = [
        articlesForCreation,
        standalone,
        "",
        "{{WikiProject banner shell|class=Unassessed|1=",
        nested,
        "}}",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const expected = [
        "{{WikiProject banner shell|class=Unassessed|1=",
        articlesForCreation,
        nested,
        "}}",
    ].join("\n");
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.equal(result, expected);
    assert.equal(result.match(/WikiProject Video games/gu)?.length, 1);
});

test("keeps one raw AfC banner when sources duplicate", () => {
    const outer =
        "{{WikiProject Articles for creation|class=start|reviewer=Outer}}";
    const nested =
        "{{WikiProject Articles for creation|class=start|reviewer=Nested}}";
    const source = [
        outer,
        "{{WikiProject banner shell|class=Start|1=",
        nested,
        "{{WikiProject Video games|importance=Low}}",
        "}}",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    const articlesForCreationCalls = result.match(
        /WikiProject Articles for creation/gu,
    );

    assert.equal(articlesForCreationCalls?.length, 1);
    assert.match(result, /reviewer=Outer/u);
    assert.doesNotMatch(result, /reviewer=Nested/u);
});

test("adds controls for other conventional banners inside the shell", () => {
    const source = [
        "{{WikiProject banner shell|class=Start|1=",
        "{{WikiProject Video games|importance=Low}}",
        "{{WikiProject Role-playing games|importance=Low|custom=yes}}",
        "{{某某專題|foo=yes}}",
        "}}",
    ].join("\n");
    const options = getExistingOtherProjectOptions(source, projectConfig);
    const assessment = createDefaultAssessment(projectConfig, source);

    assert.deepEqual(
        options.map((option) => option.label),
        ["Role-playing games", "某某"],
    );
    assert.ok(options.every((option) => option.id.startsWith("existing:")));
    assert.ok(options.every((option) => assessment.otherProjects[option.id]));
    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        source,
    );

    assessment.otherProjects[options[0].id] = false;
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.doesNotMatch(result, /WikiProject Role-playing games/u);
    assert.match(result, /\{\{某某專題\|foo=yes\}\}/u);
});

test("provides controls for standalone conventional project banners", () => {
    const banner = "{{WikiProject Role-playing games|importance=Low}}";
    const source = `${banner}\n\n== Discussion ==\nBody`;
    const options = getExistingOtherProjectOptions(source, projectConfig);
    const assessment = createDefaultAssessment(projectConfig, source);

    assert.deepEqual(options, [
        {
            id: "existing:wikiproject role-playing games",
            label: "Role-playing games",
        },
    ]);
    assert.equal(assessment.importance, NOT_VIDEO_GAME_IMPORTANCE);
    assert.equal(assessment.otherProjects[options[0].id], true);
    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        `{{WikiProject banner shell|class=Unassessed|1=\n${banner}\n}}\n\n== Discussion ==\nBody`,
    );

    assessment.otherProjects[options[0].id] = false;
    assert.doesNotMatch(
        updateTalkPageAssessment(source, assessment, projectConfig),
        /Role-playing games/u,
    );
});

test("preserves Pokémon shell metadata and current VG parameters while cleaning departed fields", () => {
    const videoGames =
        "{{WikiProject Video games |importance=High |Pokemon=yes |NINTENDO=y |NINTENDO-importance= |b1=no |b2=no |b3=no |b4=no |b5=yes |b6=yes}}";
    const cleanedVideoGames =
        "{{WikiProject Video games |importance=High |Pokemon=yes |NINTENDO=y }}";
    const source = [
        "{{WikiProject banner shell|class=C|vital=yes|",
        videoGames,
        "{{ACG專題 |importance=high}}",
        "{{WikiProject Japan |importance=mid}}",
        "}}",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const expected = source
        .replace("|vital=yes|\n", "|vital=yes|1=\n")
        .replace(videoGames, cleanedVideoGames);

    assert.equal(assessment.className, "C");
    assert.equal(assessment.importance, "High");
    assert.equal(assessment.taskForces.pokemon, true);
    assert.equal(assessment.taskForces.nintendo, true);
    assert.equal(assessment.otherProjects.acg, true);
    assert.equal(assessment.otherProjects["existing:wikiproject japan"], true);
    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        expected,
    );

    assessment.className = "B";
    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        expected.replace("|class=C|", "|class=B|"),
    );
});

test("cleans only confirmed departed VG parameters and preserves unchanged supported values", () => {
    const departed = [
        "b1",
        "b2",
        "b3",
        "b4",
        "b5",
        "b6",
        "Minecraft-importance",
        "SE-importance",
        "SEGA-importance",
        "NINTENDO-importance",
        "small",
        "demo",
        "attention",
        "nocat",
        "ASSESSMENT_CAT",
    ];

    for (const reassess of ["a", "bplus", "ppr"]) {
        const active = `{{WPVG |class=C|importance=high |NINTENDO=y |Genshin=y |reassess=${reassess} |needs-infobox=no |cover=0 |screenshot=false |listas=Sort key |category=no |Pokemon-importance=Low |b7=custom |custom={{Nested|b1=yes}}`;
        const videoGames = `${active}${departed.map((name) => `|${name}=retired`).join("")}}}`;
        const other =
            "{{WikiProject Japan|b1=yes|NINTENDO-importance=High|custom=Keep}}";
        const source = `${videoGames}\n${other}`;
        const assessment = createDefaultAssessment(projectConfig, source);

        assert.equal(assessment.taskForces.mihoyo, true);
        assert.equal(assessment.maintenance.reassess, true);
        assessment.importance = "Top";
        const result = updateTalkPageAssessment(
            source,
            assessment,
            projectConfig,
        );
        const updatedVideoGames = `${active.replace("|class=C", "").replace("|importance=high ", "|importance=Top")}}}`;

        assert.equal(
            result,
            `{{WikiProject banner shell|class=C|1=\n${updatedVideoGames}\n${other}\n}}`,
        );
        assessment.taskForces.mihoyo = false;
        assert.doesNotMatch(
            updateTalkPageAssessment(source, assessment, projectConfig),
            /\|Genshin=/u,
        );
    }
});

test("merges standalone projects and multiple shells in source order without losing shell metadata", () => {
    const japan = "{{WikiProject Japan|importance=mid|custom={{Nested|x=y}}}}";
    const acg = "{{ACG專題|class=A|importance=high}}";
    const chinese = "{{某某专题|custom=yes}}";
    const firstVideoGames = "{{WPVG|importance=Low|custom=first}}";
    const articlesForCreation =
        "{{WikiProject Articles for creation|reviewer=Keep}}";
    const source = [
        "{{Talk header}}",
        japan,
        "{{WPBS|class=C|vital=yes|listas=Shared sort|1=",
        firstVideoGames,
        acg,
        "}}",
        "{{Unmanaged banner|keep=yes}}",
        chinese,
        articlesForCreation,
        "{{WikiProject banner shell|class=B|blp=yes|category=no|1=",
        "{{WikiProject Video games|importance=Low|custom=duplicate}}",
        articlesForCreation,
        "}}",
        "",
        "Lead text with {{WPVG}} mentioned outside banners.",
        "",
        "== Discussion ==",
        "Keep this discussion exactly.",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const expected = [
        "{{Talk header}}",
        "{{WikiProject banner shell|class=C|vital=yes|listas=Shared sort|blp=yes|category=no|1=",
        japan,
        firstVideoGames,
        acg,
        chinese,
        articlesForCreation,
        "}}",
        "{{Unmanaged banner|keep=yes}}",
        "",
        "Lead text with {{WPVG}} mentioned outside banners.",
        "",
        "== Discussion ==",
        "Keep this discussion exactly.",
    ].join("\n");

    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        expected,
    );
    assert.deepEqual(
        getExistingOtherProjectOptions(source, projectConfig).map(
            (option) => option.label,
        ),
        ["Japan", "某某", "Articles for creation"],
    );
    assert.equal(
        updateTalkPageAssessment(expected, assessment, projectConfig),
        expected,
    );
});

test("VG cleanup preserves links, comments, literal tags, and parameter expressions", () => {
    const customValues = [
        "[[Example|b1=yes]]",
        "[[Example|{{Format|b1=keep}}]]",
        "<!-- |b1=keep }} -->",
        "<nowiki>|b1=keep }}</nowiki>",
        "<pre>|b1=keep }}</pre>",
        "{{{fallback|[[Example|b1=keep]]}}}",
    ];
    const japan = "{{WikiProject Japan|custom=Keep}}";

    for (const custom of customValues) {
        const videoGames = `{{WPVG|importance=Low|custom=${custom}|reassess=ppr|b1=remove}}`;
        const source = `${videoGames}\n${japan}`;
        const assessment = createDefaultAssessment(projectConfig, source);

        assert.equal(assessment.importance, "Low", custom);
        assert.equal(assessment.maintenance.reassess, true, custom);
        assert.equal(
            updateTalkPageAssessment(source, assessment, projectConfig),
            `{{WikiProject banner shell|class=Unassessed|1=\n${videoGames.replace("|b1=remove", "")}\n${japan}\n}}`,
            custom,
        );
    }
});

test("preserves opaque shell-body content and recognizes banners after it", () => {
    const videoGames =
        "{{WPVG|importance=Low|custom=<nowiki>}}</nowiki>|b1=remove}}";
    const japan = "{{WikiProject Japan|custom=yes}}";
    const opaque =
        "<!-- Keep this note }} -->Plain prose [[Example|{{WPVG}}]]<nowiki>{{WPVG|b1=keep}}</nowiki>{{{fallback|Keep this parameter}}}";
    const body = `<nowiki>Leading literal {{ }}</nowiki>${videoGames}${opaque}${japan} trailing prose.`;
    const source = `{{WPBS|class=C|vital=yes|1=${body}}}\n\n== Discussion ==\nKeep this discussion.`;
    const assessment = createDefaultAssessment(projectConfig, source);

    assert.equal(assessment.importance, "Low");
    assert.equal(assessment.otherProjects["existing:wikiproject japan"], true);
    assert.deepEqual(getExistingOtherProjectOptions(source, projectConfig), [
        {
            id: "existing:wikiproject japan",
            label: "Japan",
        },
    ]);
    assessment.className = "B";
    const expected = `{{WikiProject banner shell|class=B|vital=yes|1=\n${body.replace("|b1=remove", "")}\n}}\n\n== Discussion ==\nKeep this discussion.`;
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.equal(result, expected);
    assert.equal(
        updateTalkPageAssessment(result, assessment, projectConfig),
        expected,
    );
    assessment.otherProjects["existing:wikiproject japan"] = false;
    const withoutJapan = updateTalkPageAssessment(
        source,
        assessment,
        projectConfig,
    );

    assert.equal(withoutJapan, expected.replace(japan, ""));
    assert.ok(withoutJapan.includes(opaque));
});

test("recognizes leading banners through comments and preserves comments around moved banners", () => {
    const leadingNote = "<!-- Leading note {{ }} -->";
    const betweenNote = "<!-- Note between banners -->";
    const japan = "{{WikiProject Japan|importance=mid}}";
    const source = [
        leadingNote,
        "{{Talk header}}",
        japan,
        betweenNote,
        "{{WPBS|class=C|vital=yes|1={{WPVG|importance=High}}}}",
        "",
        "== Discussion ==",
        "Keep this discussion exactly.",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const result = updateTalkPageAssessment(source, assessment, projectConfig);

    assert.equal(assessment.className, "C");
    assert.equal(assessment.importance, "High");
    assert.equal(assessment.otherProjects["existing:wikiproject japan"], true);
    assert.ok(result.startsWith(`${leadingNote}\n{{Talk header}}\n`));
    assert.equal(result.split("WikiProject banner shell").length - 1, 1);
    assert.equal(result.split(betweenNote).length - 1, 1);
    assert.ok(result.includes(`${japan}\n{{WPVG|importance=High}}`));
    assert.equal(
        result.slice(result.indexOf("== Discussion ==")),
        "== Discussion ==\nKeep this discussion exactly.",
    );
});

test("preview is exactly the transformed talk-page top section", () => {
    const source = [
        "{{WikiProject Anime}}",
        "",
        "== Discussion ==",
        "Body",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig);

    assessment.className = "C";
    assessment.importance = "High";
    const transformed = updateTalkPageAssessment(
        source,
        assessment,
        projectConfig,
    );

    assert.equal(
        previewTalkPageTopSection(source, assessment, projectConfig),
        getTalkPageTopSection(transformed),
    );
});

test("replaces only the reviewed top section", () => {
    const current = [
        "{{Old banner}}",
        "",
        "== Discussion ==",
        "Concurrent body",
    ].join("\n");
    const reviewed = "{{Reviewed banner}}\n{{Second reviewed banner}}";

    assert.equal(
        updateTalkPageTopSection(current, reviewed),
        [
            "{{Reviewed banner}}",
            "{{Second reviewed banner}}",
            "",
            "== Discussion ==",
            "Concurrent body",
        ].join("\n"),
    );
});

test("preserves reviewed top-section whitespace exactly", () => {
    const current = "Old lead\n\n== Discussion ==\nBody";
    const reviewed = "  {{Reviewed banner}}\n\n\n";

    assert.equal(
        updateTalkPageTopSection(current, reviewed),
        `${reviewed}== Discussion ==\nBody`,
    );
    assert.equal(
        updateTalkPageTopSection("Old page without headings", reviewed),
        reviewed,
    );
});
