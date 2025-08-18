<template>
    <div class="w-full flex flex-col lg:flex-row gap-4 flex-wrap">
        <div
            v-for="(chunk, chunkIndex) in viewChunkedList"
            :key="`col-${chunkIndex}`"
            class="w-full scenario-col max-w-[calc(50%-0.6rem)] space-y-4"
        >
            <div
                v-for="(scenario) in chunk"
                :key="scenario.uId"
                class="w-full"
            >
                <JsonScenarioFormItem
                    v-model="localModel[getScenarioIndex(scenario)]"
                    :scenario="scenario"
                    :index="getScenarioIndex(scenario)"
                    @duplicate="onDuplicateScenario"
                    @remove="onRemoveScenario(scenario)"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { TestScenario, TJsonSetupForm } from '~/types/scenaries'

const props = defineProps<{
    modelValue: Array<TestScenario>
}>()
const emit = defineEmits<{
    (e: 'update:modelValue', value: Array<TestScenario>): void
    (e: 'scenario:copy', value: TestScenario): void
}>()

const countColumns = ref(1)
const localModel = useVModel(props, 'modelValue', emit)

const viewChunkedList = computed(() => {
    if (countColumns.value > 1) {
        const chunks: Array<Array<TJsonSetupForm['scenarios'][number]>> = Array.from({ length: countColumns.value }, () => [])

        localModel.value.forEach((scenario, index) => {
            chunks[index % countColumns.value].push(scenario)
        })
        return chunks
    }

    return [ localModel.value ]
})

function onRemoveScenario (scenario: TestScenario) {
    localModel.value = localModel.value.filter((item) => item.uId !== scenario.uId)
}

function onDuplicateScenario (scenario: TestScenario) {
    emit('scenario:copy', { ...scenario })
}

function getScenarioIndex (scenario: TestScenario) {
    return localModel.value.findIndex((item) => item.uId === scenario.uId)
}

onMounted(() => {
    if (window.innerWidth > 1200) {
        countColumns.value = 2
    }
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1200) {
            countColumns.value = 2
        } else {
            countColumns.value = 1
        }
    })
})
</script>

<style lang="scss">
//.scenario-col {
//    flex: 1 1 calc(50% - 1rem);
//}
</style>
