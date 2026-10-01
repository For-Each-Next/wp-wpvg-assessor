<template>
    <div class="avgp-comparison" role="region" tabindex="0" :aria-label="label">
        <p v-if="!comparison.changed" class="avgp-comparison__message">
            {{ noChangesLabel }}
        </p>
        <table v-else class="diff avgp-comparison__table">
            <caption class="avgp-comparison__caption">
                {{
                    label
                }}
            </caption>
            <colgroup>
                <col class="diff-marker" />
                <col class="diff-content" />
                <col class="diff-marker" />
                <col class="diff-content" />
            </colgroup>
            <thead>
                <tr>
                    <th colspan="2" scope="colgroup" class="diff-otitle">
                        {{ beforeLabel }}
                    </th>
                    <th colspan="2" scope="colgroup" class="diff-ntitle">
                        {{ afterLabel }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <template
                    v-for="(row, rowIndex) in comparison.rows"
                    :key="rowIndex"
                >
                    <tr v-if="row.kind === 'omitted'">
                        <td
                            colspan="2"
                            class="diff-context avgp-comparison__omitted"
                        >
                            ⋯
                        </td>
                        <td
                            colspan="2"
                            class="diff-context avgp-comparison__omitted"
                        >
                            ⋯
                        </td>
                    </tr>
                    <tr v-else>
                        <td
                            class="diff-marker"
                            :data-marker="
                                row.before.kind === 'removed' ? '−' : ''
                            "
                        ></td>
                        <td
                            class="diff-side-deleted"
                            :class="{
                                'diff-context': row.before.kind === 'context',
                                'diff-deletedline':
                                    row.before.kind === 'removed',
                                'diff-empty': row.before.kind === 'empty',
                            }"
                        >
                            <div>
                                <template
                                    v-for="(segment, segmentIndex) in row.before
                                        .segments"
                                    :key="segmentIndex"
                                >
                                    <del
                                        v-if="segment.kind === 'changed'"
                                        class="diffchange diffchange-inline"
                                        >{{ segment.text }}</del
                                    >
                                    <span v-else>{{ segment.text }}</span>
                                </template>
                            </div>
                        </td>
                        <td
                            class="diff-marker"
                            :data-marker="row.after.kind === 'added' ? '+' : ''"
                        ></td>
                        <td
                            class="diff-side-added"
                            :class="{
                                'diff-addedline': row.after.kind === 'added',
                                'diff-context': row.after.kind === 'context',
                                'diff-empty': row.after.kind === 'empty',
                            }"
                        >
                            <div>
                                <template
                                    v-for="(segment, segmentIndex) in row.after
                                        .segments"
                                    :key="segmentIndex"
                                >
                                    <ins
                                        v-if="segment.kind === 'changed'"
                                        class="diffchange diffchange-inline"
                                        >{{ segment.text }}</ins
                                    >
                                    <span v-else>{{ segment.text }}</span>
                                </template>
                            </div>
                        </td>
                    </tr>
                </template>
            </tbody>
        </table>
    </div>
</template>
