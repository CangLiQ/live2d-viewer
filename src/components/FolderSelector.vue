<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useFileScanner } from '@/composables/useFileScanner'
import { useModelStore } from '@/stores/useModelStore'
import { useMessage } from 'naive-ui'
import { saveSession, loadSession, verifyPermission, clearSession, loadFileCache } from '@/composables/usePersistence'
import type { ScanProgress } from '@/composables/useFileScanner'

const store = useModelStore()
const message = useMessage()
const { pickAndScan } = useFileScanner()

/** 扫描进度 */
const progress = ref<ScanProgress | null>(null)

/** 是否正在从缓存恢复 */
const isRestoring = ref(false)

/** 计算进度百分比 */
const progressPercent = computed(() => {
  if (!progress.value) return 0
  const p = progress.value
  if (p.phase === 'locating') return -1
  if (p.total <= 0) return 0
  return Math.round((p.current / p.total) * 100)
})

/** 进度文字描述 */
const progressText = computed(() => {
  if (!progress.value) return ''
  const p = progress.value
  switch (p.phase) {
    case 'locating': return `扫描目录...`
    case 'parsing': return `${p.current + 1}/${p.total}`
    case 'done': return '完成'
    default: return ''
  }
})

/** 选择文件夹 */
async function handleSelectFolder() {
  store.setScanning(true)
  store.setError(null)
  progress.value = null

  try {
    const { rootHandle, models } = await pickAndScan(store.useFullParse, (p) => {
      progress.value = p
    })

    store.setRootHandle(rootHandle)
    store.setModels(models)
    store.clearSelection()

    // 保存模型数据到缓存（下次打开直接恢复）
    await saveSession(rootHandle, models)

    if (models.length === 0) {
      message.warning('未在选定目录中找到任何 Live2D 模型')
    } else {
      const mode = store.useFullParse ? '全解析' : '半解析'
      message.success(`${mode}扫描完成，共找到 ${models.length} 个模型`)
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    store.setError(errMsg)
    message.error(errMsg)
  } finally {
    store.setScanning(false)
    setTimeout(() => { progress.value = null }, 1500)
  }
}

/** 重置：清除所有模型和持久化数据 */
async function handleReset() {
  await clearSession()
  store.resetAll()
  message.success('已重置，清除所有模型数据')
}

/** 尝试从缓存恢复上次的模型列表 */
async function tryRestore() {
  isRestoring.value = true
  try {
    const session = await loadSession()
    if (!session || session.models.length === 0) return

    const handle = session.rootHandle
    if (!handle) return

    const hasPermission = await verifyPermission(handle)
    if (!hasPermission) {
      console.warn('[FolderSelector] 目录权限已失效')
      await clearSession()
      return
    }

    // ★ 从缓存恢复模型列表（瞬间完成，无需扫描）
    store.setRootHandle(handle)
    store.setModels(
      session.models.map((cached) => ({
        id: cached.id,
        name: cached.name,
        directoryHandle: null as unknown as FileSystemDirectoryHandle, // 懒加载时填充
        config: cached.config,
        motionCount: cached.motionCount,
        expressionCount: cached.expressionCount,
        relativePath: cached.relativePath,
        files: [], // 文件懒加载，点击模型时收集
      }))
    )

    // 恢复上次选中的模型（如有）
    if (session.selectedModelId) {
      // 尝试从文件缓存恢复已加载的文件
      const cachedFiles = await loadFileCache(session.selectedModelId)
      if (cachedFiles) {
        // 在 store 中找到该模型，直接将 files 注入
        const targetModel = store.models.find((m) => m.id === session.selectedModelId)
        if (targetModel) {
          targetModel.files = cachedFiles
        }
      }
      store.selectModel(session.selectedModelId)
    }

    message.success(`已恢复 ${session.models.length} 个模型`)
  } catch (e) {
    console.warn('[FolderSelector] 自动恢复失败:', e)
    await clearSession()
  } finally {
    isRestoring.value = false
  }
}

onMounted(() => {
  tryRestore()
})

// 当选中模型变化时，保存会话以便刷新后恢复
watch(
  () => store.selectedModelId,
  (newId) => {
    if (store.rootDirectoryHandle && store.models.length > 0) {
      saveSession(store.rootDirectoryHandle, store.models, newId)
    }
  }
)
</script>

<template>
  <div class="folder-selector-group">
    <!-- 解析模式切换（bool 滑动条） -->
    <div class="parse-mode-toggle" :class="{ disabled: store.isScanning || isRestoring }" @click="store.toggleParseMode()">
      <span class="toggle-label" :class="{ active: !store.useFullParse }">半解析</span>
      <div class="toggle-track" :class="{ on: store.useFullParse }">
        <div class="toggle-thumb" />
      </div>
      <span class="toggle-label" :class="{ active: store.useFullParse }">全解析</span>
    </div>

    <button
      class="folder-selector-btn"
      :class="{ scanning: store.isScanning }"
      :disabled="store.isScanning || isRestoring"
      @click="handleSelectFolder"
    >
      <svg
        v-if="!store.isScanning"
        class="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <svg
        v-else
        class="w-4 h-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1" stroke-linecap="round" />
      </svg>

      <span v-if="isRestoring">恢复缓存中...</span>
      <span v-else-if="!store.isScanning">选择模型根目录</span>
      <span v-else-if="progress?.phase === 'locating'">扫描目录中...</span>
      <span v-else-if="store.useFullParse">解析模型 {{ progressText }}</span>
      <span v-else>扫描目录...</span>

      <template v-if="store.isScanning && progressPercent >= 0">
        <span class="progress-percent">{{ progressPercent }}%</span>
      </template>

      <span v-if="!store.isScanning && store.models.length > 0" class="model-count-badge">
        {{ store.models.length }}
      </span>

      <div v-if="store.isScanning && progressPercent >= 0 && progressPercent < 100" class="progress-bar-track">
        <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
    </button>

    <button
      v-if="store.models.length > 0 && !store.isScanning"
      class="reset-btn"
      title="重置，清除所有模型数据"
      @click="handleReset"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      <span>重置</span>
    </button>
  </div>
</template>

<style scoped>
.folder-selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.folder-selector-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 9999px;
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(139, 92, 246, 0.15));
  border: 1px solid rgba(0, 240, 255, 0.3);
  color: #00f0ff;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.1), inset 0 0 12px rgba(0, 240, 255, 0.05);
  overflow: hidden;
}

.folder-selector-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.25), rgba(139, 92, 246, 0.25));
  border-color: rgba(0, 240, 255, 0.6);
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.25), inset 0 0 16px rgba(0, 240, 255, 0.08);
  transform: translateY(-1px);
}

.folder-selector-btn:active:not(:disabled) {
  transform: translateY(0);
}

.folder-selector-btn:disabled {
  opacity: 0.85;
  cursor: not-allowed;
}

.folder-selector-btn.scanning {
  border-color: rgba(139, 92, 246, 0.5);
  animation: pulse-border 2s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-color: rgba(139, 92, 246, 0.3); }
  50% { border-color: rgba(139, 92, 246, 0.7); }
}

.progress-percent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.progress-bar-track {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 3px;
  background: rgba(139, 92, 246, 0.15);
  border-radius: 0 0 9999px 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #00f0ff);
  border-radius: 0 0 9999px 9999px;
  transition: width 0.3s ease;
}

.model-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 9999px;
  background: rgba(139, 92, 246, 0.3);
  border: 1px solid rgba(139, 92, 246, 0.5);
  color: #c4b5fd;
  font-size: 11px;
  font-weight: 600;
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 9999px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5;
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-btn:hover {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
  transform: translateY(-1px);
}

.reset-btn:active {
  transform: translateY(0);
}

/* ====== 解析模式切换（bool滑动条） ====== */
.parse-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 9999px;
  background: rgba(17, 24, 39, 0.6);
  border: 1px solid rgba(100, 116, 139, 0.2);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.parse-mode-toggle:hover {
  border-color: rgba(0, 240, 255, 0.3);
  background: rgba(17, 24, 39, 0.8);
}

.parse-mode-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-cyber-muted);
  font-family: var(--font-mono);
  transition: color 0.2s ease;
}

.toggle-label.active {
  color: #00f0ff;
}

.toggle-track {
  position: relative;
  width: 36px;
  height: 18px;
  border-radius: 9999px;
  background: rgba(100, 116, 139, 0.3);
  transition: background 0.25s ease;
}

.toggle-track.on {
  background: rgba(0, 240, 255, 0.35);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #94a3b8;
  transition: all 0.25s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-track.on .toggle-thumb {
  left: 20px;
  background: #00f0ff;
  box-shadow: 0 0 6px rgba(0, 240, 255, 0.5);
}
</style>
