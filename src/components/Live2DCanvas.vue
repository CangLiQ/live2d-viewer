<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useLive2D } from '@/composables/useLive2D'
import { useModelStore } from '@/stores/useModelStore'
import { lazyLoadModelFiles } from '@/composables/useFileScanner'
import { saveFileCache } from '@/composables/usePersistence'

const props = defineProps<{
  onMotionPlay?: (group: string, index: number) => void
  onExpressionChange?: (id: string) => void
}>()

const emit = defineEmits<{
  (e: 'ready', fn: ReturnType<typeof useLive2D>): void
}>()

const store = useModelStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const live2d = useLive2D(canvasRef)
const canvasAreaRef = ref<HTMLElement | null>(null)

/** 鼠标拖拽状态 */
let isDragging = false
let lastX = 0
let lastY = 0
/** 是否按住 R 键（旋转模式） */
const isRotating = ref(false)
/** 旋转模式下记录的初始鼠标相对于画布中心的角度 */
let rotationStartAngle = 0
/** 旋转灵敏度（百分比，200 = 1:2） */
const rotationSensitivity = ref(200)
/** 视线追踪幅度（0=不追踪，100=最大幅度，默认80%） */
const eyeAmplitude = ref(80)

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'r' || e.key === 'R') {
    isRotating.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'r' || e.key === 'R') {
    isRotating.value = false
  }
}

onMounted(() => {
  emit('ready', live2d)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  // ★ 视线追踪监听整个窗口，兼容显示框外区域
  window.addEventListener('mousemove', onGlobalMouseMove)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('mousemove', onGlobalMouseMove)
})

/** 当前加载任务的 AbortController（用于取消上次未完成的加载） */
let loadAbortController: AbortController | null = null

// 当选中模型变化时自动加载（缓存恢复的模型需懒加载文件）
watch(
  () => store.selectedModel,
  async (model) => {
    // 取消上一次未完成的加载
    if (loadAbortController) {
      loadAbortController.abort()
      loadAbortController = null
    }

    if (model) {
      // 半解析/缓存恢复模式：按需加载文件
      if (model.files.length === 0 && store.rootDirectoryHandle) {
        loadAbortController = new AbortController()
        const signal = loadAbortController.signal

        store.loadingProgress = 0
        await lazyLoadModelFiles(store.rootDirectoryHandle, model, (percent) => {
          store.loadingProgress = percent
        }, signal)

        // 如果被取消，不继续加载模型
        if (signal.aborted) {
          store.loadingProgress = null
          return
        }
        // 缓存已加载的文件，刷新后可恢复
        saveFileCache(model.id, model.files)
        store.loadingProgress = null
      }
      await live2d.loadModel(model.files)
    } else {
      live2d.release()
      store.loadingProgress = null
    }
  },
  { immediate: true }
)

/** 鼠标按下 */
function onMouseDown(e: MouseEvent) {
  isDragging = true
  lastX = e.clientX
  lastY = e.clientY
  if (isRotating.value && canvasAreaRef.value) {
    // 记录鼠标相对于画布中心的角度
    const rect = canvasAreaRef.value.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    rotationStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx)
  }
}

/** ★ 全局鼠标移动 — 视线追踪（兼容显示框外区域） */
function onGlobalMouseMove(e: MouseEvent) {
  // 自定义视线追踪：根据鼠标离画布中心的距离决定幅度
  if (live2d.isLoaded.value && canvasAreaRef.value) {
    const rect = canvasAreaRef.value.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // 归一化坐标 -1..1
    const nx = (e.clientX - cx) / (rect.width / 2)
    const ny = (e.clientY - cy) / (rect.height / 2)
    // 距离比例：0=中心（不看），1=边缘（最大幅度）
    const dist = Math.min(1, Math.sqrt(nx * nx + ny * ny))
    // 幅度 = 距离 × 用户设定幅度系数
    const amp = dist * (eyeAmplitude.value / 100)
    // 方向归一化后乘以幅度
    let fx = nx, fy = ny
    if (dist > 0.001) {
      fx = (nx / dist) * amp
      fy = (ny / dist) * amp
    }
    live2d.setFocus(fx, -fy)
  }
}

/** 鼠标移动 — 仅拖拽/旋转（画布内） */
function onMouseMove(e: MouseEvent) {
  if (!isDragging) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
  if (isRotating.value && canvasAreaRef.value) {
    // 以画布中心为原点，计算当前鼠标角度
    const rect = canvasAreaRef.value.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx)
    // 角度差 = 当前角度 - 初始角度，正 = 顺时针，负 = 逆时针
    let angleDelta = currentAngle - rotationStartAngle
    // 处理角度跨越 ±π 边界
    if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI
    if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI
    live2d.applyRotate(angleDelta * (rotationSensitivity.value / 100))
    // 更新起始角度，实现连续跟随
    rotationStartAngle = currentAngle
  } else {
    // 默认 → 平移模式
    live2d.applyTranslate(dx * 0.8, dy * 0.8)
  }
}

/** 鼠标松开 */
function onMouseUp() {
  isDragging = false
}

/** 鼠标离开画布 → 仅停止拖拽（视线追踪仍在 window 级别运行） */
function onMouseLeave() {
  isDragging = false
}

/** 滚轮缩放 */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.08 : 0.08
  live2d.applyScale(delta)
}
</script>

<template>
  <div class="canvas-wrapper">
    <!-- Canvas 区域 -->
    <div ref="canvasAreaRef" class="canvas-area" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseLeave" @wheel.prevent="onWheel">
      <!-- 网格背景装饰 -->
      <div class="grid-bg" />

      <canvas
        ref="canvasRef"
        class="live2d-canvas"
      />

      <!-- 加载状态 -->
      <div v-if="live2d.isLoading.value" class="loading-overlay">
        <div class="spinner-ring" />
        <p class="mt-3 text-sm text-cyber-accent/80">
          正在加载模型...
          <span v-if="store.loadingProgress !== null" class="ml-2 text-cyber-purple font-mono text-xs">{{ store.loadingProgress }}%</span>
        </p>
      </div>

      <!-- 错误状态 -->
      <div v-if="live2d.error.value" class="error-overlay">
        <svg class="w-8 h-8 mb-2 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <p class="text-sm text-red-300 max-w-xs text-center">{{ live2d.error.value }}</p>
      </div>

      <!-- 空状态提示 -->
      <div v-if="!store.selectedModel && !live2d.isLoading.value" class="empty-hint">
        <svg class="w-16 h-16 mb-4 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <p class="text-sm text-cyber-muted">从左侧列表选择一个模型开始预览</p>
      </div>

      <!-- R 键旋转提示 -->
      <div v-if="isRotating && live2d.isLoaded.value" class="rotate-hint">
        <span>旋转模式</span>
      </div>
    </div>

    <!-- 底部工具栏 -->
    <div v-if="live2d.isLoaded.value" class="toolbar">
      <div class="toolbar-left">
        <button class="tool-btn" title="重置视图" @click="live2d.resetTransform()">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>重置</span>
        </button>
        <div class="transform-info">
          <span>X:{{ live2d.posX.value }}</span>
          <span>Y:{{ live2d.posY.value }}</span>
          <span>{{ live2d.rotation.value }}°</span>
          <span>{{ (live2d.scale.value * 100).toFixed(0) }}%</span>
        </div>
      </div>
      <div class="toolbar-right">
        <div class="sensitivity-wrapper">
          <label class="sensitivity-label">旋转幅度</label>
          <div class="sensitivity-control">
            <input
              v-model.number="rotationSensitivity"
              type="range"
              min="50"
              max="500"
              step="10"
              class="sensitivity-slider"
            />
            <span class="sensitivity-value">{{ rotationSensitivity }}%</span>
          </div>
        </div>
        <div class="sensitivity-wrapper">
          <label class="sensitivity-label">视线幅度</label>
          <div class="sensitivity-control">
            <input
              v-model.number="eyeAmplitude"
              type="range"
              min="0"
              max="100"
              step="5"
              class="sensitivity-slider"
            />
            <span class="sensitivity-value">{{ eyeAmplitude }}%</span>
          </div>
        </div>
        <div class="key-hint">按住 <kbd>R</kbd> 拖拽旋转</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(30, 41, 59, 0.5);
}

.canvas-area {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  overflow: hidden;
}

.canvas-area:active {
  cursor: grabbing;
}

.grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(30, 41, 59, 0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgba(30, 41, 59, 0.3) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.live2d-canvas {
  position: relative;
  z-index: 1;
  /* 固定内部分辨率(1920x1080)，CSS 拉伸填满容器 */
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 加载动画 */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10, 14, 26, 0.85);
  z-index: 10;
}

.spinner-ring {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(0, 240, 255, 0.15);
  border-top-color: #00f0ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 错误覆盖层 */
.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10, 14, 26, 0.9);
  z-index: 10;
}

/* 空状态提示 */
.empty-hint {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

/* 底部工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(17, 24, 39, 0.95);
  border-top: 1px solid rgba(30, 41, 59, 0.5);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(100, 116, 139, 0.2);
  color: var(--color-cyber-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(30, 41, 59, 0.9);
  border-color: rgba(0, 240, 255, 0.3);
  color: #00f0ff;
}

.transform-info {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #00f0ff;
  font-family: var(--font-mono);
  padding: 4px 12px;
  border-radius: 4px;
  background: rgba(0, 240, 255, 0.06);
  border: 1px solid rgba(0, 240, 255, 0.15);
}

.key-hint {
  font-size: 11px;
  color: var(--color-cyber-muted);
}

.key-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(100, 116, 139, 0.3);
  background: rgba(30, 41, 59, 0.6);
  font-family: var(--font-mono);
  font-size: 10px;
}

/* 旋转幅度控制 */
.sensitivity-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sensitivity-label {
  font-size: 11px;
  color: var(--color-cyber-muted);
  white-space: nowrap;
}

.sensitivity-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sensitivity-slider {
  width: 60px;
  min-width: 40px;
  max-width: 100px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.sensitivity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #00f0ff;
  cursor: pointer;
  border: 2px solid rgba(0, 240, 255, 0.3);
  transition: border-color 0.2s;
}

.sensitivity-slider::-webkit-slider-thumb:hover {
  border-color: #00f0ff;
}

.sensitivity-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #00f0ff;
  cursor: pointer;
  border: 2px solid rgba(0, 240, 255, 0.3);
}

.sensitivity-value {
  font-size: 11px;
  color: #00f0ff;
  font-family: var(--font-mono);
  min-width: 36px;
  text-align: right;
}

/* R 键旋转模式提示（画布内叠加） */
.rotate-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 14px;
  border-radius: 6px;
  background: rgba(0, 240, 255, 0.15);
  border: 1px solid rgba(0, 240, 255, 0.3);
  color: #00f0ff;
  font-size: 12px;
  font-weight: 500;
  z-index: 20;
  pointer-events: none;
  backdrop-filter: blur(4px);
}
</style>
