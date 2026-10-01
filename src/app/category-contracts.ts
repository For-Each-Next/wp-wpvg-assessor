/** Article navigation and background reviewed saves for category assessment. */

import type {
    AssessmentSaveReview,
    AssessmentState,
} from "./assessment-contracts.ts";

export interface CategoryArticleStyles {
    styles: string;
    origin: string;
}

export interface CategoryMemberBatch {
    titles: string[];
    continuation: string | null;
}

export interface CategoryAssessmentPage {
    state: AssessmentState;
    articleHtml: string;
    position: number;
    review?: AssessmentSaveReview;
    saveError?: string;
}

export interface CategoryAssessmentSession {
    current(): Promise<CategoryAssessmentPage | null>;
    next(): Promise<CategoryAssessmentPage | null>;
    previous(): Promise<CategoryAssessmentPage | null>;
    hasPrevious(): boolean;
    hasNext(): boolean;
    hasFailedPages(): boolean;
    pendingSaveCount(): number;
    save(page: CategoryAssessmentPage, review: AssessmentSaveReview): void;
    subscribe(listener: () => void): () => void;
    dispose(): void;
}

export interface CategoryAssessmentWorkflow {
    open(api: mw.Api): Promise<CategoryAssessmentSession>;
}
