<script setup lang="ts">
import { ref } from 'vue'
import { useModelStore } from '@/stores/useModelStore'
import { prefetchModelFiles } from '@/composables/useFileScanner'

const store = useModelStore()

/** hover 预加载状态 */
const hoveredModelId = ref<string | null>(null)
let prefetchAbortController: AbortController | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null

/** 鼠标悬停：延迟 300ms 后开始预加载 */
function onModelHover(modelId: string) {
  if (hoveredModelId.value === modelId) return // 已在预加载

  // 清除之前的定时器和预加载
  clearPrefetch()

  hoveredModelId.value = modelId

  // 延迟 300ms 开始预加载（避免快速划过时频繁触发）
  hoverTimer = setTimeout(() => {
    const model = store.models.find(m => m.id === modelId)
    if (!model || model.files.length > 0 || !store.rootDirectoryHandle) return

    prefetchAbortController = new AbortController()
    prefetchModelFiles(store.rootDirectoryHandle, model, prefetchAbortController.signal)
      .catch(() => {}) // 忽略取消错误
  }, 300)
}

/** 鼠标移开：取消预加载 */
function onModelLeave() {
  clearPrefetch()
  hoveredModelId.value = null
}

/** 清除预加载状态 */
function clearPrefetch() {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  if (prefetchAbortController) {
    prefetchAbortController.abort()
    prefetchAbortController = null
  }
}

function selectModel(id: string) {
  // 点击时清除预加载状态
  clearPrefetch()
  hoveredModelId.value = null
  store.selectModel(id)
}

function isLoadingModel(id: string): boolean {
  return store.selectedModelId === id && store.loadingProgress !== null
}
</script>

<template>
  <div class="model-list-container">
    <!-- 空状态：未选择文件夹 -->
    <div v-if="store.models.length === 0" class="empty-state">
      <svg class="w-12 h-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p class="text-sm text-cyber-muted">请先选择包含模型的文件夹</p>
    </div>

    <!-- 空状态：筛选无结果 -->
    <div v-else-if="store.displayedModels.length === 0" class="empty-state">
      <svg class="w-12 h-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p class="text-sm text-cyber-muted">当前筛选条件下无匹配模型</p>
      <button class="clear-filter-btn" @click="store.clearFilters()">清除筛选</button>
    </div>

    <!-- 模型列表 -->
    <div v-else class="model-grid">
      <div
        v-for="model in store.displayedModels"
        :key="model.id"
        class="model-card"
        :class="{ 
          selected: store.selectedModelId === model.id,
          loading: isLoadingModel(model.id),
          'prefetching': hoveredModelId === model.id && model.files.length === 0
        }"
        @click="selectModel(model.id)"
        @mouseenter="onModelHover(model.id)"
        @mouseleave="onModelLeave"
      >
        <!-- 选中指示条 -->
        <div v-if="store.selectedModelId === model.id" class="selected-indicator glow-border" />

        <div class="card-content">
          <!-- 模型名称 -->
          <h3 class="model-name" :title="model.name">{{ model.name }}</h3>

          <!-- 路径标签 -->
          <p class="model-path" :title="model.relativePath">{{ model.relativePath }}</p>

          <!-- 标签行 -->
          <div class="tags-row">
            <span v-if="model.motionCount > 0" class="tag tag-motion">
              <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {{ model.motionCount }} 动作
            </span>
            <span v-if="model.expressionCount > 0" class="tag tag-expression">
              <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
              {{ model.expressionCount }} 表情
            </span>
            <span v-if="model.motionCount === 0 && model.expressionCount === 0" class="tag tag-basic">
              仅静态
            </span>
          </div>

          <!-- 正在加载百分比 -->
          <div v-if="isLoadingModel(model.id)" class="card-loading-text">
            加载中 {{ store.loadingProgress }}%
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-list-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.clear-filter-btn {
  margin-top: 12px;
  padding: 6px 16px;
  border-radius: 9999px;
  border: 1px solid rgba(0, 240, 255, 0.3);
  background: rgba(0, 240, 255, 0.1);
  color: #00f0ff;
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-filter-btn:hover {
  background: rgba(0, 240, 255, 0.2);
  border-color: rgba(0, 240, 255, 0.5);
}

.model-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-card {
  position: relative;
  padding: 12px 14px 12px 18px;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.6);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.25s ease;
  overflow: hidden;
}

.model-card:hover {
  transform: translateY(-2px);
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(100, 116, 139, 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.model-card.selected {
  background: rgba(0, 240, 255, 0.06);
  border-color: rgba(0, 240, 255, 0.2);
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.08);
}

.model-card.loading {
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 0 16px rgba(34, 197, 94, 0.15), inset 0 0 20px rgba(34, 197, 94, 0.05);
  animation: loading-pulse 1.2s ease-in-out infinite;
}

/** 预加载中状态（hover 触发） */
.model-card.prefetching {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(30, 41, 59, 0.5);
}

@keyframes loading-pulse {
  0%, 100% {
    border-color: rgba(34, 197, 94, 0.3);
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.1);
  }
  50% {
    border-color: rgba(34, 197, 94, 0.7);
    box-shadow: 0 0 24px rgba(34, 197, 94, 0.3), inset 0 0 30px rgba(34, 197, 94, 0.08);
  }
}

.card-loading-text {
  margin-top: 8px;
  font-size: 10px;
  font-weight: 600;
  color: #22c55e;
  font-family: var(--font-mono);
  animation: text-pulse 1.2s ease-in-out infinite;
}

@keyframes text-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

.selected-indicator {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.02em;
}

.model-path {
  font-size: 11px;
  color: var(--color-cyber-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.7;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
}

.tag-motion {
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.25);
  color: #67e8f9;
}

.tag-expression {
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
}

.tag-basic {
  background: rgba(100, 116, 139, 0.1);
  border: 1px solid rgba(100, 116, 139, 0.25);
  color: #94a3b8;
}
</style>
