<script setup lang="ts">
import { ref } from 'vue'
import { NMessageProvider } from 'naive-ui'
import FolderSelector from '@/components/FolderSelector.vue'
import ModelList from '@/components/ModelList.vue'
import Live2DCanvas from '@/components/Live2DCanvas.vue'
import ControlPanel from '@/components/ControlPanel.vue'
import HorizontalTagBar from '@/components/category/HorizontalTagBar.vue'
import VerticalTagBar from '@/components/category/VerticalTagBar.vue'

/** Live2D 渲染实例引用 */
const live2dRef = ref<ReturnType<typeof import('@/composables/useLive2D').useLive2D> | null>(null)

function onCanvasReady(fn: ReturnType<typeof import('@/composables/useLive2D').useLive2D>) {
  live2dRef.value = fn as never
}

function handlePlayMotion(group: string, index: number) {
  live2dRef.value?.playMotion(group, index)
}

function handleSetExpression(id: string) {
  live2dRef.value?.setExpression(id)
}
</script>

<template>
  <NMessageProvider>
    <div class="app-container">
      <!-- 顶部标题栏 -->
      <header class="top-bar">
        <div class="title-group">
          <div class="logo-icon">
            <img src="/logo.png" alt="Logo" class="logo-img" />
          </div>
          <h1 class="app-title">Live2D Viewer</h1>
          <span class="version-tag">v1.0</span>
        </div>

        <FolderSelector />
      </header>

      <!-- 分类便签系统 -->
      <HorizontalTagBar />
      <VerticalTagBar />

      <!-- 主内容区 -->
      <main class="main-content">
        <!-- 左侧：模型列表 -->
        <aside class="sidebar-left">
          <div class="sidebar-header">
            <svg class="w-4 h-4 text-cyber-accent/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span class="text-xs font-medium tracking-wider uppercase">模型列表</span>
          </div>
          <ModelList />
        </aside>

        <!-- 右侧：渲染区 + 控制面板 -->
        <section class="render-area">
          <Live2DCanvas @ready="onCanvasReady" />
          <!-- 右侧边栏：动作/表情控制面板 -->
          <ControlPanel :play-motion="handlePlayMotion" :set-expression="handleSetExpression" />
        </section>
      </main>
    </div>
  </NMessageProvider>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: var(--color-cyber-dark);
  overflow: hidden;
}

/* ====== 顶部标题栏 ====== */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: rgba(17, 24, 39, 0.8);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid rgba(30, 41, 59, 0.6);
  flex-shrink: 0;
  z-index: 100;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(139, 92, 246, 0.15));
  border: 1px solid rgba(0, 240, 255, 0.2);
  color: var(--color-cyber-accent);
  overflow: hidden;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #f1f5f9;
}

.version-tag {
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(100, 116, 139, 0.15);
  border: 1px solid rgba(100, 116, 139, 0.25);
  font-size: 10px;
  font-weight: 600;
  color: var(--color-cyber-muted);
  font-family: var(--font-mono);
}

/* ====== 主内容区 ====== */
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ====== 左侧边栏 ====== */
.sidebar-left {
  width: 320px;
  min-width: 280px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  background: rgba(17, 24, 39, 0.4);
  border-right: 1px solid rgba(30, 41, 59, 0.5);
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid rgba(30, 41, 59, 0.4);
  flex-shrink: 0;
}

/* ====== 右侧渲染区域 ====== */
.render-area {
  flex: 1;
  display: flex;        /* 水平排列：画布 + 右侧控制面板 */
  min-width: 0;
  overflow: hidden;
}
</style>
