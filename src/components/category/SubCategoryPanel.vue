<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CategoryNode } from '@/composables/useCategory'
import { countModels } from '@/composables/useCategory'
import type { ScannedModel } from '@/types/model'

const props = defineProps<{
  node: CategoryNode
}>()

const emit = defineEmits<{
  select: [models: ScannedModel[]]
  close: []
  hover: []
  unhover: []
}>()

/** 面包屑路径 */
const breadcrumb = ref<CategoryNode[]>([props.node])

/** 当 node 变化时重置面包屑 */
watch(() => props.node, (newNode) => {
  breadcrumb.value = [newNode]
}, { immediate: true })

/** 当前显示的节点列表 */
const currentNode = computed(() => breadcrumb.value[breadcrumb.value.length - 1])

/** 当前层级的子节点列表 */
const currentChildren = computed(() => {
  const node = currentNode.value
  if (node.type === 'model') {
    // 如果当前节点是叶子，直接返回空
    return []
  }
  return node.children ?? []
})

/** 点击子节点 */
function onChildClick(child: CategoryNode) {
  if (child.type === 'model') {
    // 叶子节点：选中模型
    emit('select', child.models ?? [])
  } else {
    // 文件夹节点：进入下一级
    breadcrumb.value.push(child)
  }
}

/** 面包屑点击返回 */
function onBreadcrumbClick(index: number) {
  breadcrumb.value = breadcrumb.value.slice(0, index + 1)
}

/** 返回上级 */
function goBack() {
  if (breadcrumb.value.length > 1) {
    breadcrumb.value.pop()
  }
}
</script>

<template>
  <div class="sub-panel" @click.stop @mouseenter="emit('hover')" @mouseleave="emit('unhover')">
    <!-- 面包屑导航 -->
    <div class="breadcrumb">
      <button
        v-for="(crumb, index) in breadcrumb"
        :key="crumb.key"
        class="crumb-item"
        :class="{ active: index === breadcrumb.length - 1 }"
        @click="onBreadcrumbClick(index)"
      >
        <svg
          v-if="index > 0"
          class="crumb-arrow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {{ crumb.label }}
      </button>
    </div>

    <!-- 关闭按钮 -->
    <button class="close-btn" @click="emit('close')">
      ✕
    </button>

    <!-- 子节点列表 -->
    <div class="child-list">
      <!-- 返回上级按钮 -->
      <button
        v-if="breadcrumb.length > 1"
        class="child-item back-item"
        @click="goBack"
      >
        <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        返回上级
      </button>

      <button
        v-for="child in currentChildren"
        :key="child.key"
        class="child-item"
        :class="{
          'is-folder': child.type === 'folder',
          'is-model': child.type === 'model',
        }"
        @click="onChildClick(child)"
      >
        <!-- 图标 -->
        <svg
          v-if="child.type === 'folder'"
          class="item-icon folder-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <svg
          v-else
          class="item-icon model-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>

        <span class="child-label">{{ child.label }}</span>
        <span class="child-count">{{ countModels(child) }}</span>

        <!-- 箭头指示 -->
        <svg
          v-if="child.type === 'folder'"
          class="child-arrow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <!-- 空状态 -->
      <div
        v-if="currentChildren.length === 0 && currentNode.type === 'folder'"
        class="empty-hint"
      >
        该分类下暂无模型
      </div>
    </div>
  </div>
</template>

<style scoped>
.sub-panel {
  width: 260px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(30, 41, 59, 0.5);
  border-radius: 8px;
  margin-left: 0;
  margin-top: 20px;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

/* 面包屑导航 */
.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(30, 41, 59, 0.4);
  flex-shrink: 0;
  padding-right: 32px;
}

.crumb-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.crumb-item:hover {
  color: #e2e8f0;
  background: rgba(100, 116, 139, 0.15);
}

.crumb-item.active {
  color: #00f0ff;
}

.crumb-arrow {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

/* 关闭按钮 */
.close-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
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
  z-index: 1;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

/* 子节点列表 */
.child-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.child-item {
  display: flex;
  align-items: center;
  gap: 6px;
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

.child-item:hover {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.2);
  color: #00f0ff;
}

.child-item.is-folder:hover {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
}

.child-item.is-model:hover {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.back-item {
  border-bottom: 1px solid rgba(30, 41, 59, 0.3);
  margin-bottom: 2px;
  color: #94a3b8;
}

.back-item:hover {
  color: #e2e8f0;
  background: rgba(100, 116, 139, 0.15);
  border-color: rgba(100, 116, 139, 0.3);
}

.item-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.folder-icon {
  color: #c4b5fd;
}

.model-icon {
  color: #86efac;
}

.child-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.child-count {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
  font-size: 10px;
  min-width: 18px;
  text-align: center;
}

.child-arrow {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: #64748b;
  opacity: 0.5;
}

.empty-hint {
  padding: 20px 10px;
  text-align: center;
  color: #64748b;
  font-size: 11px;
}

.back-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
</style>