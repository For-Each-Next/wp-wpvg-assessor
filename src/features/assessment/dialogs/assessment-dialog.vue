<template>
    <cdx-dialog
        v-model:open="open"
        class="avgp-dialog"
        :title="dialogTitle"
        :lang="interfaceLocale"
        :close-button-label="msg('dialog.cancel')"
        @update:open="onOpenChange"
    >
        <template #footer>
            <div class="avgp-dialog__actions">
                <cdx-button
                    action="destructive"
                    weight="quiet"
                    :disabled="saving"
                    @click="onCancel"
                >
                    {{ msg("dialog.cancel") }}
                </cdx-button>
                <cdx-button
                    v-if="stagingAvailable"
                    action="default"
                    weight="normal"
                    :disabled="saving || preparing"
                    @click="onStage"
                >
                    {{ stageLabel }}
                </cdx-button>
                <cdx-button
                    action="progressive"
                    weight="primary"
                    :disabled="saving || preparing"
                    @click="onSave"
                >
                    {{ submitLabel }}
                </cdx-button>
            </div>
        </template>
        <div class="avgp-dialog__body">
            <div
                class="avgp-status-region"
                aria-live="polite"
                aria-atomic="true"
            >
                <cdx-message
                    v-if="status"
                    class="avgp-status"
                    :type="statusType"
                >
                    {{ status }}
                </cdx-message>
                <cdx-progress-bar
                    v-if="saving || preparing"
                    class="avgp-save-progress"
                    :aria-label="status || msg('dialog.saving')"
                />
            </div>

            <div class="avgp-assessment-grid" :aria-busy="saving || preparing">
                <section
                    class="avgp-controls"
                    aria-labelledby="avgp-assessment-title"
                >
                    <h2 id="avgp-assessment-title" class="avgp-section-title">
                        {{ msg("dialog.assessment") }}
                    </h2>
                    <div class="avgp-rating-grid">
                        <cdx-field
                            class="avgp-section"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.class")
                            }}</template>
                            <cdx-combobox
                                :selected="classInput"
                                :menu-items="classMenuItems"
                                :menu-config="{ visibleItemLimit: 6 }"
                                :aria-label="msg('dialog.class')"
                                :disabled="saving || preparing"
                                name="className"
                                @update:selected="setClassName"
                                @change="commitClassName"
                                @blur="commitClassName"
                            />
                        </cdx-field>
                        <cdx-field
                            class="avgp-section"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.importance")
                            }}</template>
                            <cdx-select
                                :selected="assessment.importance"
                                :menu-items="importanceOptions"
                                :aria-label="msg('dialog.importance')"
                                :disabled="saving || preparing"
                                name="importance"
                                @update:selected="setImportance"
                            />
                        </cdx-field>
                    </div>

                    <cdx-field
                        class="avgp-section"
                        :is-fieldset="true"
                        :disabled="saving || preparing || videoGamesDisabled"
                    >
                        <template #label>{{
                            msg("dialog.taskForces")
                        }}</template>
                        <div class="avgp-check-grid">
                            <cdx-checkbox
                                v-for="option in taskForceOptions"
                                :key="option.id"
                                :model-value="assessment.taskForces[option.id]"
                                :disabled="
                                    saving || preparing || videoGamesDisabled
                                "
                                :name="'taskForce-' + option.id"
                                @update:model-value="
                                    setSelection(
                                        'taskForces',
                                        option.id,
                                        $event,
                                    )
                                "
                            >
                                {{ option.label }}
                            </cdx-checkbox>
                        </div>
                    </cdx-field>

                    <cdx-field
                        class="avgp-section"
                        :is-fieldset="true"
                        :disabled="saving || preparing || videoGamesDisabled"
                    >
                        <template #label>{{
                            msg("dialog.maintenance")
                        }}</template>
                        <div class="avgp-check-grid">
                            <cdx-checkbox
                                v-for="option in maintenanceOptions"
                                :key="option.id"
                                :model-value="assessment.maintenance[option.id]"
                                :disabled="
                                    saving || preparing || videoGamesDisabled
                                "
                                :name="'maintenance-' + option.id"
                                @update:model-value="
                                    setSelection(
                                        'maintenance',
                                        option.id,
                                        $event,
                                    )
                                "
                            >
                                {{ option.label }}
                            </cdx-checkbox>
                        </div>
                    </cdx-field>

                    <cdx-field
                        class="avgp-section"
                        :is-fieldset="true"
                        :disabled="saving || preparing"
                    >
                        <template #label>{{
                            msg("dialog.otherProjects")
                        }}</template>
                        <div class="avgp-check-grid">
                            <cdx-checkbox
                                v-for="option in otherProjectOptions"
                                :key="option.id"
                                :model-value="
                                    assessment.otherProjects[option.id]
                                "
                                :disabled="saving || preparing"
                                :name="'otherProject-' + option.id"
                                @update:model-value="
                                    setSelection(
                                        'otherProjects',
                                        option.id,
                                        $event,
                                    )
                                "
                            >
                                {{ option.label }}
                            </cdx-checkbox>
                        </div>
                    </cdx-field>
                </section>

                <section
                    class="avgp-source"
                    aria-labelledby="avgp-review-title"
                >
                    <h2 id="avgp-review-title" class="avgp-section-title">
                        {{ msg("dialog.reviewTalkPage") }}
                    </h2>
                    <cdx-field class="avgp-section avgp-source-field">
                        <template #label>{{
                            msg("dialog.readySource")
                        }}</template>
                        <cdx-text-area
                            class="avgp-compare-textarea"
                            :model-value="previewText"
                            :readonly="saving || preparing"
                            rows="8"
                            @update:model-value="onPreviewInput"
                        />
                    </cdx-field>

                    <div class="avgp-section avgp-comparison-field">
                        <h3 class="avgp-field-title">
                            {{ msg("dialog.leadDiff") }}
                        </h3>
                        <p class="avgp-description avgp-comparison-help">
                            {{ msg("dialog.diffHelp") }}
                        </p>
                        <wikitext-comparison
                            :after-label="msg('dialog.afterSave')"
                            :before-label="msg('dialog.currentSource')"
                            :comparison="talkComparison"
                            :label="msg('dialog.leadDiff')"
                            :no-changes-label="msg('registration.noChanges')"
                        />
                    </div>

                    <cdx-field class="avgp-section avgp-summary">
                        <template #label>{{
                            msg("dialog.talkSummary")
                        }}</template>
                        <cdx-text-input
                            :model-value="summary"
                            :readonly="saving || preparing"
                            @update:model-value="onSummaryInput"
                        />
                    </cdx-field>
                </section>
            </div>

            <section
                class="avgp-registration"
                :aria-busy="saving || preparing"
                aria-labelledby="avgp-registration-title"
            >
                <h2 id="avgp-registration-title" class="avgp-section-title">
                    {{ msg("dialog.newPageList") }}
                </h2>
                <p
                    v-if="registrationDisabled"
                    class="avgp-registration-message"
                >
                    {{ registrationLabel }}
                </p>
                <cdx-checkbox
                    v-else
                    class="avgp-registration-choice"
                    :model-value="shouldRegister"
                    :disabled="saving || preparing"
                    name="registerNewPage"
                    @update:model-value="setRegister"
                >
                    {{ registrationLabel }}
                </cdx-checkbox>

                <div v-if="showListReview" class="avgp-list-review">
                    <div class="avgp-section avgp-list-preview">
                        <h3 class="avgp-field-title">
                            {{ msg("dialog.listChanges") }}
                        </h3>
                        <wikitext-comparison
                            :after-label="msg('dialog.afterSave')"
                            :before-label="msg('dialog.before')"
                            :comparison="listComparison"
                            :label="msg('dialog.listChanges')"
                            :no-changes-label="msg('registration.noChanges')"
                        />
                    </div>
                    <cdx-field class="avgp-section avgp-list-summary">
                        <template #label>{{
                            msg("dialog.listSummary")
                        }}</template>
                        <cdx-text-input
                            :model-value="displayedListSummary"
                            :readonly="saving || preparing"
                            @update:model-value="setDisplayedListSummary"
                        />
                    </cdx-field>
                </div>
            </section>

            <section
                v-if="stagedTalkReviews.length"
                class="avgp-staged-reviews"
                aria-labelledby="avgp-staged-title"
            >
                <h2 id="avgp-staged-title" class="avgp-section-title">
                    {{ msg("dialog.stagedTalkChanges") }}
                </h2>
                <article
                    v-for="review in stagedTalkReviews"
                    :key="review.talkTitle"
                    class="avgp-staged-review"
                >
                    <h3 class="avgp-field-title">{{ review.title }}</h3>
                    <cdx-field class="avgp-section">
                        <template #label>{{
                            msg("dialog.readySource")
                        }}</template>
                        <pre class="avgp-staged-source">{{
                            review.previewText
                        }}</pre>
                    </cdx-field>
                    <div class="avgp-section">
                        <h4 class="avgp-field-title">
                            {{ msg("dialog.leadDiff") }}
                        </h4>
                        <wikitext-comparison
                            :after-label="msg('dialog.afterSave')"
                            :before-label="msg('dialog.currentSource')"
                            :comparison="review.comparison"
                            :label="msg('dialog.leadDiff')"
                            :no-changes-label="msg('registration.noChanges')"
                        />
                    </div>
                    <div class="avgp-section">
                        <h4 class="avgp-field-title">
                            {{ msg("dialog.talkSummary") }}
                        </h4>
                        <p class="avgp-staged-summary">{{ review.summary }}</p>
                    </div>
                </article>
            </section>
        </div>
    </cdx-dialog>
</template>
