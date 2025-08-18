import type { ObjectAnyType } from '~/types'

const isPreviewOpen = ref(false)
const dataToPreview = shallowRef<ObjectAnyType>({})

export default function () {

    const openPreviewWindow = (data: ObjectAnyType) => {
        dataToPreview.value = { ...data }
        isPreviewOpen.value = true
    }

    const closePreviewWindow = () => {
        isPreviewOpen.value = false
        dataToPreview.value = {}
    }

    watch(isPreviewOpen, (newVal) => {
        if (!newVal) {
            closePreviewWindow()
        }
    })
    return {
        isPreviewOpen,
        dataToPreview,
        openPreviewWindow,
        closePreviewWindow
    }
}
