import type { ProjectConfig } from "./project-types.ts";

export default {
    videoGames: {
        template: "WikiProject Video games",
        aliases: [
            "WikiProject Video games",
            "[電电]子[遊游][戲戏][專专][題题]",
            "WPVG",
            "WikiProject Square Enix",
            "WikiProject Electronic games",
        ],
        classParameter: "class",
        importanceParameter: "importance",
        taskForces: [
            {
                id: "pokemon",
                parameter: "Pokemon",
            },
            {
                id: "minecraft",
                parameter: "Minecraft",
            },
            {
                id: "se",
                parameter: "SE",
            },
            {
                id: "sega",
                parameter: "SEGA",
            },
            {
                id: "nintendo",
                parameter: "NINTENDO",
            },
            {
                id: "mihoyo",
                parameter: "MiHoYo",
                aliases: ["Genshin"],
            },
        ],
    },
    otherProjects: [
        {
            id: "fictionalCharacters",
            template: "WikiProject Fictional characters",
            aliases: [
                "WikiProject Fictional characters",
                "虚构角色[專专][題题]",
                "虚构人物[專专][題题]",
            ],
        },
        {
            id: "acg",
            template: "ACG專題",
            aliases: [
                "ACG[專专][題题]",
                "WPACG",
                "WikiProject ACG",
                "WikiProject Anime",
                "WikiProject Anime and manga",
                "WPANIME",
            ],
        },
        {
            id: "biography",
            template: "WikiProject Biography",
            aliases: [
                "WikiProject Biography",
                "[傳传][記记][專专][題题]",
                "WPBiography",
                "WikiProject [傳传][記记]",
                "人物[專专][題题]",
                "WikiProject Biographies",
            ],
        },
        {
            id: "company",
            template: "WikiProject Companies",
            aliases: [
                "WikiProject Companies",
                "公司[專专][題题]",
                "WikiProject 公司",
            ],
        },
        {
            id: "films",
            template: "WikiProject Film",
            aliases: [
                "WikiProject Film",
                "[電电]影[專专][題题]",
                "Film",
                "WPFilm",
                "WikiProject 电影",
                "WPFILM",
                "WP Film",
            ],
        },
        {
            id: "music",
            template: "音樂專題",
            aliases: [
                "音[樂乐][專专][題题]",
                "WikiProject 音[樂乐]",
                "WikiProject Music",
                "WikiProject Songs",
                "歌曲[專专][題题]",
                "WikiProject Albums",
            ],
        },
    ],
} as const satisfies ProjectConfig;
