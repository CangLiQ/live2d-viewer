<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModelStore } from '@/stores/useModelStore'
import { getCharacterLabel } from '@/composables/useCategory'

const store = useModelStore()

/** 是否显示便签栏 */
const visible = ref(false)

/** 触发区域鼠标进入 */
function onTriggerEnter() {
  visible.value = true
}

/** 便签栏鼠标离开 */
function onBarLeave() {
  // 延迟隐藏，避免误触
  setTimeout(() => {
    visible.value = false
  }, 300)
}

/** 角色标签列表（按配置顺序排列） */
const characterTags = computed(() => {
  const groups = store.characterGroups
  const tags: { key: string; label: string; count: number }[] = []

  // 按角色配置顺序
  const charOrder = ['anon', 'mana', 'mutsumi', 'nyamu', 'rana', 'sakiko', 'soyo', 'taki', 'tomori', 'uika', 'umiri']

  for (const key of charOrder) {
    if (groups[key]) {
      tags.push({
        key,
        label: getCharacterLabel(key),
        count: groups[key].length,
      })
    }
  }

  // other
  if (groups.other) {
    tags.push({
      key: 'other',
      label: '其他',
      count: groups.other.length,
    })
  }

  return tags
})

/** 标签点击 */
function onTagClick(key: string) {
  store.toggleCharacter(key)
}

/** 鼠标滚轮：下滚右移、上滚左移 */
function onWheel(e: WheelEvent) {
  // 阻止默认滚动行为
  e.preventDefault()
  const list = e.currentTarget as HTMLElement
  // deltaY > 0 表示向下滚 → 内容向右移动（scrollLeft 增加）
  // deltaY < 0 表示向上滚 → 内容向左移动（scrollLeft 减少）
  list.scrollLeft += e.deltaY
}
</script>

<template>
  <!-- 触发区域：屏幕左下角 -->
  <div
    class="trigger-area"
    @mouseenter="onTriggerEnter"
  >
    <div class="trigger-hint">
      <svg class="trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
      <span class="trigger-text">角色筛选</span>
    </div>
  </div>

  <!-- 便签栏 -->
  <Transition name="slide-up">
    <div
      v-if="visible"
      class="tag-bar"
      @mouseleave="onBarLeave"
    >
      <div class="tag-list" @wheel.prevent="onWheel">
        <!-- 全部标签 -->
        <button
          class="tag-item"
          :class="{ active: store.activeCharacterKey === null || store.activeCharacterKey === 'all' }"
          @click="store.toggleCharacter('all')"
        >
          全部 ({{ store.models.length }})
        </button>

        <button
          v-for="tag in characterTags"
          :key="tag.key"
          class="tag-item"
          :class="{ active: store.activeCharacterKey === tag.key }"
          @click="onTagClick(tag.key)"
        >
          {{ tag.label }} ({{ tag.count }})
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 触发区域：屏幕左下底边 */
.trigger-area {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 30vw;
  min-width: 200px;
  height: 28px;
  z-index: 900;
  pointer-events: auto;
  cursor: default;
  display: flex;
  align-items: flex-end;
  padding: 0 0 0 8px;
}

.trigger-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 0 8px 0 0;
  background: rgba(152, 251, 152, 0.15);
  border: 1px solid rgba(152, 251, 152, 0.25);
  border-bottom: none;
  color: rgba(152, 251, 152, 0.6);
  font-size: 11px;
  font-family: var(--font-mono);
  transition: all 0.2s ease;
}

.trigger-area:hover .trigger-hint {
  background: rgba(152, 251, 152, 0.25);
  border-color: rgba(152, 251, 152, 0.5);
  color: rgba(152, 251, 152, 0.9);
}

.trigger-icon {
  width: 14px;
  height: 14px;
}

/* 便签栏 */
.tag-bar {
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 901;
  width: 100%;
  max-height: 180px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(30, 41, 59, 0.5);
  overflow: hidden;
}

.tag-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 4px;
  align-items: center;
  min-height: 40px;
}

.tag-item {
  flex-shrink: 0;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(100, 116, 139, 0.3);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  font-size: 13px;
  font-family: var(--font-mono);
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.tag-item:hover {
  background: rgba(0, 240, 255, 0.1);
  border-color: rgba(0, 240, 255, 0.4);
  color: #00f0ff;
}

.tag-item.active {
  background: rgba(0, 240, 255, 0.18);
  border-color: rgba(0, 240, 255, 0.6);
  color: #00f0ff;
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.15);
}

/* Vue Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>