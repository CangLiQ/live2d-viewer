<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useModelStore } from '@/stores/useModelStore'
import { countModels } from '@/composables/useCategory'
import SubCategoryPanel from './SubCategoryPanel.vue'
import type { CategoryNode } from '@/composables/useCategory'
import type { ScannedModel } from '@/types/model'

const store = useModelStore()

/** 是否显示便签栏 */
const visible = ref(false)

/** 当前选中的一级分类节点 */
const selectedRoot = ref<CategoryNode | null>(null)

/** 是否显示次级面板 */
const showSubPanel = ref(false)

let showTimer: ReturnType<typeof setTimeout> | null = null

/** 触发区域鼠标进入 */
function onTriggerEnter() {
  if (showTimer) clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    visible.value = true
  }, 150)
}

/** 触发区域鼠标离开 */
function onTriggerLeave() {
  if (showTimer) clearTimeout(showTimer)
}

/** 点击外部关闭 */
function onGlobalClick(e: MouseEvent) {
  if (!visible.value) return

  const target = e.target as HTMLElement
  // 检查点击的是否是分类系统内的元素
  const barWrapper = document.querySelector('.vertical-bar-wrapper')
  const triggerArea = document.querySelector('.trigger-area')

  if (barWrapper && barWrapper.contains(target)) return
  if (triggerArea && triggerArea.contains(target)) return

  // 点击了外部，关闭
  visible.value = false
  showSubPanel.value = false
  selectedRoot.value = null
}

/** 点击一级分类 */
function onRootClick(node: CategoryNode) {
  if (selectedRoot.value?.key === node.key && showSubPanel.value) {
    showSubPanel.value = false
    selectedRoot.value = null
  } else {
    selectedRoot.value = node
    showSubPanel.value = true
  }
}

/** 点击模型叶子节点（从 SubCategoryPanel 冒泡） */
function onModelSelect(models: ScannedModel[]) {
  store.setFolderModels(models)
  visible.value = false
  showSubPanel.value = false
  selectedRoot.value = null
}

/** ESC 键关闭 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeSubPanel()
    visible.value = false
  }
}

/** 关闭次级面板 */
function closeSubPanel() {
  showSubPanel.value = false
  selectedRoot.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('click', onGlobalClick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('click', onGlobalClick)
})
</script>

<template>
  <!-- 触发区域：屏幕左侧 -->
  <div
    class="trigger-area"
    @mouseenter="onTriggerEnter"
    @mouseleave="onTriggerLeave"
  >
    <span class="trigger-text">路径筛选</span>
  </div>

  <!-- 竖向便签 + 次级面板容器 -->
  <Transition name="slide-left">
    <div
      v-if="visible"
      class="vertical-bar-wrapper"
    >
      <!-- 竖向便签本体 -->
      <div class="vertical-bar">
        <div class="bar-header">
          <span class="bar-title">分类浏览</span>
          <button
            class="close-btn"
            @click="visible = false; showSubPanel = false; selectedRoot = null"
          >
            ✕
          </button>
        </div>

        <div class="bar-list">
          <button
            v-for="root in store.folderTree"
            :key="root.key"
            class="bar-item"
            :class="{ active: selectedRoot?.key === root.key }"
            @click="onRootClick(root)"
          >
            <span class="item-label">{{ root.label }}</span>
            <span class="item-count">{{ countModels(root) }}</span>
          </button>
        </div>
      </div>

      <!-- 次级面板 -->
      <SubCategoryPanel
        v-if="showSubPanel && selectedRoot"
        :node="selectedRoot"
        @select="onModelSelect"
        @close="closeSubPanel"
      />
    </div>
  </Transition>
</template>

<style scoped>
/* 触发区域：屏幕左侧边 */
.trigger-area {
  position: fixed;
  left: 0;
  top: 0;
  width: 36px;
  height: 55vh;
  min-height: 200px;
  z-index: 900;
  pointer-events: auto;
  cursor: default;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.trigger-text {
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 0.3em;
  padding: 40px 6px;
  border-radius: 0 8px 8px 0;
  background: rgba(152, 251, 152, 0.06);
  border: 1px solid rgba(152, 251, 152, 0.12);
  border-left: none;
  color: rgba(152, 251, 152, 0.35);
  font-size: 12px;
  font-family: var(--font-mono);
  transition: all 0.25s ease;
  user-select: none;
}

.trigger-area:hover .trigger-text {
  background: rgba(152, 251, 152, 0.12);
  border-color: rgba(152, 251, 152, 0.28);
  color: rgba(152, 251, 152, 0.65);
}

/* 便签包装器（包含竖向便签和次级面板） */
.vertical-bar-wrapper {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 901;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding-top: 20px;
  pointer-events: auto;
  gap: 0;
}

/* 竖向便签本体 */
.vertical-bar {
  width: 200px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(30, 41, 59, 0.5);
  border-left: none;
  border-radius: 0 8px 8px 0;
  overflow: hidden;
  flex-shrink: 0;
}

.bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(30, 41, 59, 0.4);
  flex-shrink: 0;
}

.bar-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.close-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-cyber-muted);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.bar-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #e2e8f0;
  font-size: 13px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.bar-item:hover {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.2);
  color: #00f0ff;
}

.bar-item.active {
  background: rgba(0, 240, 255, 0.15);
  border-color: rgba(0, 240, 255, 0.4);
  color: #00f0ff;
}

.item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  flex-shrink: 0;
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
  font-size: 10px;
  min-width: 18px;
  text-align: center;
}

/* Vue Transition */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-left-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
