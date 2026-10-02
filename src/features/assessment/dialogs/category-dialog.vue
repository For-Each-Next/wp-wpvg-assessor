<template>
    <cdx-dialog
        v-model:open="batchOpen"
        class="avgp-category-dialog"
        :title="msg('batch.title')"
        :lang="interfaceLocale"
        :close-button-label="msg('dialog.cancel')"
        :fixed-height="true"
        @update:open="onBatchOpenChange"
    >
        <div class="avgp-category-body" :aria-busy="batchBusy">
            <div
                class="avgp-category-status"
                aria-live="polite"
                aria-atomic="true"
            >
                <cdx-message v-if="batchError" type="error">{{
                    batchError
                }}</cdx-message>
                <cdx-progress-bar
                    v-if="batchBusy"
                    :aria-label="msg('batch.loading')"
                />
            </div>
            <template v-if="batchArticle">
                <h2 class="avgp-category-title">{{ batchArticleLabel }}</h2>
                <iframe
                    :key="batchArticle.state.talkTitle"
                    class="avgp-category-preview"
                    :title="msg('batch.articlePreview')"
                    sandbox=""
                    referrerpolicy="no-referrer"
                    :srcdoc="batchDocument"
                ></iframe>
                <cdx-field
                    :is-fieldset="true"
                    class="avgp-category-class"
                    :disabled="batchBusy"
                >
                    <template #label>{{ msg("batch.class") }}</template>
                    <div class="avgp-category-ratings">
                        <cdx-button-group
                            v-for="(buttons, index) in batchButtonGroups"
                            :key="index"
                            class="avgp-category-rating-group"
                            :buttons="buttons"
                            :aria-label="
                                buttons.map((button) => button.label).join(', ')
                            "
                            :disabled="batchBusy"
                            @click="onBatchAction"
                        />
                    </div>
                </cdx-field>
                <details class="avgp-category-review">
                    <summary>{{ msg("batch.reviewLead") }}</summary>
                    <pre>{{ batchPreview }}</pre>
                    <cdx-field :disabled="batchBusy">
                        <template #label>{{
                            msg("dialog.talkSummary")
                        }}</template>
                        <cdx-text-input
                            :model-value="batchSummary"
                            :disabled="batchBusy"
                            @update:model-value="setBatchSummary"
                        />
                    </cdx-field>
                </details>
            </template>
            <cdx-message v-else-if="!batchBusy && !batchError" type="notice">{{
                batchPendingSaves > 0
                    ? msg("batch.pendingSaves", { count: batchPendingSaves })
                    : batchFinished
                      ? msg("batch.finished")
                      : msg("batch.empty")
            }}</cdx-message>
        </div>
        <template #footer>
            <div class="avgp-category-footer">
                <p class="avgp-category-help">
                    {{ msg("batch.help") }}
                </p>
                <p
                    v-if="batchArticle && batchPendingSaves > 0"
                    class="avgp-category-help"
                    role="status"
                >
                    {{
                        msg("batch.pendingSaves", { count: batchPendingSaves })
                    }}
                </p>
                <div class="avgp-category-actions">
                    <cdx-button
                        action="default"
                        weight="quiet"
                        @click="onBatchCancel"
                        >{{ msg("dialog.cancel") }}</cdx-button
                    >
                    <cdx-button
                        v-if="batchError && !batchArticle"
                        action="progressive"
                        weight="primary"
                        :disabled="batchBusy"
                        @click="onBatchRetry"
                        >{{ msg("batch.retry") }}</cdx-button
                    >
                </div>
            </div>
        </template>
    </cdx-dialog>
</template>
