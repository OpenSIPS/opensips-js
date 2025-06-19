<template>
    <div class="w-full">
        <VcFormItem label="SIP Domain">
            <VcInput
                v-model="SipDomainModel"
                placeholder="SIP Domain"
            />
        </VcFormItem>
        <VcFormItem label="Username">
            <VcInput
                v-model="UsernameModel"
                placeholder="Username"
            />
        </VcFormItem>
        <VcFormItem label="Password">
            <VcInput
                v-model="PasswordModel"
                placeholder="Password"
            />
        </VcFormItem>
    </div>
</template>

<script setup lang="ts">
import type { ObjectAnyType } from '~/types'

const props = defineProps<{
    modelValue: ObjectAnyType
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: ObjectAnyType): void
}>()

const localModel = useVModel(props, 'modelValue', emit)

const SipDomainModel = computed({
    get: () => localModel.value?.sip_domain,
    set: (value) => {
        localModel.value.sip_domain = value
    }
})

const UsernameModel = computed({
    get: () => localModel.value?.username,
    set: (value) => {
        localModel.value.username = value
    }
})

const PasswordModel = computed({
    get: () => localModel.value?.password,
    set: (value) => {
        localModel.value.password = value
    }
})

onMounted(() => {
    if (Object.keys(localModel.value)?.length === 0) {
        emit('update:modelValue', {
            sip_domain: '',
            username: '',
            password: ''
        })
    }
})
</script>
