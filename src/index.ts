/** Side-effect-free assessment and wikitext operations. */
export {
    createDefaultAssessment,
    normalizeAssessmentClass,
    parseAssessment,
    previewTalkPageTopSection,
    updateTalkPageAssessment,
} from "./domain/assessment.ts";
export { compareWikitext } from "./domain/wikitext-comparison.ts";
export { prepareNewPageListRegistration } from "./domain/new-page-list.ts";
export { NOT_VIDEO_GAME_IMPORTANCE } from "./domain/types.ts";
export type { Assessment, RegistrationResult } from "./domain/types.ts";
