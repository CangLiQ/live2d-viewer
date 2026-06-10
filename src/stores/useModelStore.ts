import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ScannedModel } from '@/types/model'
import { buildCharacterGroups, buildFolderTree } from '@/composables/useCategory'
import type { CategoryNode } from '@/composables/useCategory'

export const useModelStore = defineStore('model', () => {
  /** 扫描到的所有模型 */
  const models = ref<ScannedModel[]>([])

  /** 当前选中的模型 ID */
  const selectedModelId = ref<string | null>(null)

  /** 根目录句柄 */
  const rootDirectoryHandle = ref<FileSystemDirectoryHandle | null>(null)

  /** 是否正在扫描 */
  const isScanning = ref(false)

  /** 扫描错误信息 */
  const scanError = ref<string | null>(null)

  /** 当前选中的模型（计算属性） */
  const selectedModel = ref<ScannedModel | null>(null)

  /** 当前活跃的动作分组名（用于 UI 高亮） */
  const activeMotion = ref<string | null>(null)
  /** 当前活跃的表情 ID（用于 UI 高亮） */
  const activeExpression = ref<string | null>(null)

  /** 解析模式：true=全解析（加载全部文件），false=半解析（仅元数据，点击模型时按需加载） */
  const useFullParse = ref(true)

  /** 当前模型加载进度（百分比 0-100，null=未在加载） */
  const loadingProgress = ref<number | null>(null)

  /* ==================== 分类便签状态 ==================== */

  /** 角色分类结果（computed） */
  const characterGroups = computed(() => buildCharacterGroups(models.value))

  /** 文件夹分类树（computed） */
  const folderTree = computed(() => buildFolderTree(models.value))

  /** 当前选中的角色分类键（'all' | 英文角色名 | null） */
  const activeCharacterKey = ref<string | null>(null)

  /** 当前选中的文件夹叶子节点模型列表 */
  const activeFolderModels = ref<ScannedModel[] | null>(null)

  /** 最终展示的模型列表（角色筛选、文件夹筛选各自独立作用于全量模型，不取交集） */
  const displayedModels = computed(() => {
    // 角色筛选：从全量模型中筛选
    if (activeCharacterKey.value && activeCharacterKey.value !== 'all') {
      return characterGroups.value[activeCharacterKey.value] ?? []
    }

    // 文件夹筛选：从全量模型中筛选
    if (activeFolderModels.value !== null) {
      return activeFolderModels.value
    }

    return models.value
  })

  /** 设置模型列表 */
  function setModels(newModels: ScannedModel[]) {
    models.value = newModels
  }

  /** 设置根目录句柄 */
  function setRootHandle(handle: FileSystemDirectoryHandle) {
    rootDirectoryHandle.value = handle
  }

  /** 选中模型 */
  function selectModel(id: string) {
    selectedModelId.value = id
    const found = models.value.find((m) => m.id === id)
    selectedModel.value = found ?? null
  }

  /** 清除选中 */
  function clearSelection() {
    selectedModelId.value = null
    selectedModel.value = null
  }

  /** 设置扫描状态 */
  function setScanning(value: boolean) {
    isScanning.value = value
  }

  /** 设置错误信息 */
  function setError(msg: string | null) {
    scanError.value = msg
  }

  /** 设置当前活跃动作 */
  function setActiveMotion(group: string | null) {
    activeMotion.value = group
  }

  /** 设置当前活跃表情 */
  function setActiveExpression(id: string | null) {
    activeExpression.value = id
  }

  /* ==================== 分类操作 ==================== */

  /** 切换角色标签（独立切换，清除文件夹筛选） */
  function toggleCharacter(key: string | null) {
    if (activeCharacterKey.value === key || key === 'all') {
      // 点击已选中的标签，或点击"全部"，都取消筛选
      activeCharacterKey.value = null
    } else {
      activeCharacterKey.value = key
      // 角色筛选与文件夹筛选互相独立，选了角色就清除文件夹筛选
      activeFolderModels.value = null
    }
  }

  /** 设置文件夹筛选（独立切换，清除角色筛选） */
  function setFolderModels(models: ScannedModel[] | null) {
    activeFolderModels.value = models
    // 文件夹筛选与角色筛选互相独立，选了文件夹就清除角色筛选
    activeCharacterKey.value = null
  }

  /** 切换解析模式 */
  function toggleParseMode() {
    useFullParse.value = !useFullParse.value
  }

  /** 清除所有筛选 */
  function clearFilters() {
    activeCharacterKey.value = null
    activeFolderModels.value = null
  }

  /** 重置所有状态（清除模型+筛选+句柄） */
  function resetAll() {
    models.value = []
    selectedModelId.value = null
    selectedModel.value = null
    rootDirectoryHandle.value = null
    isScanning.value = false
    scanError.value = null
    activeMotion.value = null
    activeExpression.value = null
    activeCharacterKey.value = null
    activeFolderModels.value = null
    loadingProgress.value = null
  }

  return {
    models,
    selectedModelId,
    selectedModel,
    activeMotion,
    activeExpression,
    rootDirectoryHandle,
    isScanning,
    scanError,
    characterGroups,
    folderTree,
    activeCharacterKey,
    activeFolderModels,
    displayedModels,
    setModels,
    setRootHandle,
    selectModel,
    clearSelection,
    setScanning,
    setError,
    setActiveMotion,
    setActiveExpression,
    useFullParse,
    toggleParseMode,
    loadingProgress,
    toggleCharacter,
    setFolderModels,
    clearFilters,
    resetAll,
  }
})

export type { CategoryNode }