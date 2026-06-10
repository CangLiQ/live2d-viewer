<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useModelStore } from '@/stores/useModelStore'

const store = useModelStore()

const props = defineProps<{
  playMotion?: (group: string, index: number) => void
  setExpression?: (id: string) => void
}>()

/** 动作搜索关键词 */
const motionSearch = ref('')
/** 表情搜索关键词 */
const expressionSearch = ref('')

// ★ 切换模型时清空搜索词，防止旧搜索过滤新模型内容
watch(
  () => store.selectedModel?.id,
  () => {
    motionSearch.value = ''
    expressionSearch.value = ''
  }
)

/** 动作分组列表（搜索过滤） */
const motionGroups = computed(() => {
  const model = store.selectedModel
  if (!model?.config.motions) return []

  const keyword = motionSearch.value.toLowerCase().trim()
  return Object.entries(model.config.motions)
    .map(([groupName, items]) => ({
      name: groupName,
      items: items.filter(
        (m) =>
          !keyword ||
          groupName.toLowerCase().includes(keyword) ||
          (m.text || '').toLowerCase().includes(keyword),
      ),
    }))
    .filter((g) => g.items.length > 0)
})

/** 判断动作分组是否当前活跃 */
const isActiveMotion = computed(() => {
  return (groupName: string) => store.activeMotion === groupName
})

/** 模型是否有动作（不受搜索影响） */
const hasAnyMotions = computed(() => {
  const model = store.selectedModel
  if (!model?.config.motions) return false
  return Object.keys(model.config.motions).length > 0
})

/** 表情列表（搜索过滤） */
const expressions = computed(() => {
  const list = store.selectedModel?.config.expressions ?? []
  if (list.length === 0) return []

  const keyword = expressionSearch.value.toLowerCase().trim()
  if (!keyword) return list
  return list.filter((e) => e.name.toLowerCase().includes(keyword))
})

/** 模型是否有表情（不受搜索影响） */
const hasAnyExpressions = computed(() => {
  const list = store.selectedModel?.config.expressions ?? []
  return list.length > 0
})

/** 播放动作 */
function handlePlayMotion(groupName: string, index: number) {
  store.setActiveMotion(groupName)
  props.playMotion?.(groupName, index)
}

/** 切换表情 */
function handleSetExpression(expressionID: string) {
  store.setActiveExpression(expressionID)
  props.setExpression?.(expressionID)
}
</script>

<template>
  <div class="control-panel">
    <!-- 无内容提示 -->
    <div v-if="!store.selectedModel" class="no-selection">
      <p class="text-xs text-cyber-muted">选择模型后显示控制选项</p>
    </div>

    <template v-else>
      <!-- 动作控制区 -->
      <div v-if="hasAnyMotions" :key="`motions-${store.selectedModel?.id}`" class="control-section">
        <div class="section-header">
          <span class="section-title">动作</span>
          <button
            v-if="motionSearch"
            class="search-clear"
            title="清除搜索"
            @click="motionSearch = ''"
          >
            ✕
          </button>
        </div>
        <!-- 搜索框 -->
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="motionSearch"
            type="text"
            placeholder="搜索动作名称…"
            class="search-input"
          />
        </div>
        <!-- 动作列表 -->
        <div class="item-list">
          <template v-if="motionGroups.length > 0">
            <template v-for="group in motionGroups" :key="group.name">
              <button
                v-for="(_, idx) in group.items"
                :key="`${group.name}-${idx}`"
                class="item-row"
                :class="{ active: isActiveMotion(group.name) }"
                @click="handlePlayMotion(group.name, idx)"
              >
                {{ group.name }}
              </button>
            </template>
          </template>
          <div v-else-if="motionSearch.trim() !== ''" class="no-match-hint">
            未找到匹配动作
          </div>
        </div>
      </div>

      <!-- 表情控制区 -->
      <div v-if="hasAnyExpressions" :key="`expressions-${store.selectedModel?.id}`" class="control-section">
        <div class="section-header">
          <span class="section-title">表情</span>
          <button
            v-if="expressionSearch"
            class="search-clear"
            title="清除搜索"
            @click="expressionSearch = ''"
          >
            ✕
          </button>
        </div>
        <!-- 搜索框 -->
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="expressionSearch"
            type="text"
            placeholder="搜索表情名称…"
            class="search-input"
          />
        </div>
        <!-- 表情列表 -->
        <div class="item-list">
          <template v-if="expressions.length > 0">
            <button
              v-for="exp in expressions"
              :key="exp.name"
              class="item-row expr-row"
              :class="{ active: store.activeExpression === exp.name }"
              @click="handleSetExpression(exp.name)"
            >
              {{ exp.name }}
            </button>
          </template>
          <div v-else-if="expressionSearch.trim() !== ''" class="no-match-hint">
            未找到匹配表情
          </div>
        </div>
      </div>

      <!-- 模型没有任何动作或表情 -->
      <div v-if="!hasAnyMotions && !hasAnyExpressions" class="no-content">
        <p class="text-xs text-cyber-muted">该模型暂无动作或表情数据</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ====== 右侧边栏容器 ====== */
.control-panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  min-width: 280px;
  max-width: 400px;
  padding: 12px;
  background: rgba(17, 24, 39, 0.6);
  border-left: 1px solid rgba(30, 41, 59, 0.5);
  overflow: hidden;           /* 不让面板整体滚，由内部 section 各自滚 */
  flex-shrink: 0;
  gap: 8px;
  height: 100%;               /* 占满父容器高度 */
}

.no-selection,
.no-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

/* ====== 搜索无匹配提示 ====== */
.no-match-hint {
  padding: 14px 10px;
  text-align: center;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.5);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  user-select: none;
}

/* ====== 分区 ====== */
.control-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;                    /* 两个 section 平分高度 */
  min-height: 0;              /* 允许 flex 子项收缩 */
  overflow: hidden;           /* 配合 item-list 内部滚动 */
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.04em;
}

.search-clear {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(100, 116, 139, 0.25);
  color: var(--color-cyber-muted);
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.search-clear:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

/* ====== 搜索框 ====== */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--color-cyber-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 7px 28px 7px 30px;
  border-radius: 6px;
  border: 1px solid rgba(51, 65, 85, 0.5);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: rgba(148, 163, 184, 0.4);
}

.search-input:focus {
  border-color: rgba(0, 240, 255, 0.35);
}

/* ====== 列表项 ====== */
.item-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;                    /* 填满 section 剩余空间 */
  min-height: 0;              /* 允许收缩，触发内部滚动 */
  overflow-y: auto;           /* 内容过多时内部滚动 */
}

.item-row {
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s ease;
  word-break: break-all;
  line-height: 1.4;
}

.item-row:hover {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.2);
  color: #00f0ff;
}

.item-row.active {
  background: rgba(0, 240, 255, 0.15);
  border-color: rgba(0, 240, 255, 0.5);
  color: #00f0ff;
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.15);
}

.expr-row:hover {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
}

.expr-row.active {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.5);
  color: #c4b5fd;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.15);
}
</style>
