import { ref, onUnmounted, type Ref } from 'vue'
import * as PIXI from 'pixi.js'
import { Live2DModel, MotionPriority, ModelSettings } from 'pixi-live2d-display/cubism2'

// ★ 官方文档要求的必要步骤：暴露 PIXI 到 window
// pixi-live2d-display 需要通过 window.PIXI.Ticker 自动更新模型动画
;(window as unknown as Record<string, unknown>).PIXI = PIXI

// ★ 修复 URL 编码不匹配问题
// FileLoader.factory (line 1414) 中 validateFiles 传入的是 encodeURI 后的路径，
// 但 ModelSettings.prototype.resolveURL 返回的是解码后的路径（包含中文、特殊字符）。
// 导致 validateFiles 中 files.includes(actualPath) 比较失败，抛出：
//   File ".chara/model.moc" is defined in settings, but doesn't exist in given files
//
// 注意：不能直接用 encodeURI()，因为它会把空格编码为 %20，
// 而 File.webkitRelativePath 中保留原始空格，导致含空格的路径匹配失败。
// 修复方案：只编码非 ASCII 字符（中文等），保留空格和常见安全字符。
const _origResolveURL = ModelSettings.prototype.resolveURL
ModelSettings.prototype.resolveURL = function (this: ModelSettings, path: string): string {
  const resolved = _origResolveURL.call(this, path)
  return resolved.replace(/[^\x20-\x7E]/g, (c) => encodeURIComponent(c))
}

/**
 * Live2D 渲染核心 composable
 *
 * ★ 加载方式：Live2DModel.from(files)
 *   files 是 File[] 数组，每个 File 设置了正确的 webkitRelativePath。
 *   FileLoader 中间件会自动处理：
 *     1. 找到 model.json，创建 settings
 *     2. 用 utils.url.resolve 解析每个 definedFile 的实际路径
 *     3. 从 files 中匹配 webkitRelativePath，生成 Blob URL
 *     4. 覆盖 settings.resolveURL，后续加载都走 Blob URL
 */
export function useLive2D(canvasRef: Ref<HTMLCanvasElement | null>) {
  let app: PIXI.Application | null = null
  let model: InstanceType<typeof Live2DModel> | null = null

  /** 加载状态 */
  const isLoading = ref(false)
  /** 错误信息 */
  const error = ref<string | null>(null)
  /** 模型是否已加载 */
  const isLoaded = ref(false)

  /** 缩放比例 */
  const scale = ref(1.0)

  /** 模型位置 X */
  const posX = ref(0)
  /** 模型位置 Y */
  const posY = ref(0)
  /** 模型旋转角度（度） */
  const rotation = ref(0)

  /** 固定内部舞台尺寸（参考 WebGAL 固定分辨率策略） */
  const STAGE_WIDTH = 1920
  const STAGE_HEIGHT = 1080

  /** 模型首次加载时的初始缩放值，用于 resetTransform 直接恢复 */
  let initialScale = 1.0
  /** 初始位置（作为 X/Y 的原点） */
  let initialX = STAGE_WIDTH / 2
  let initialY = STAGE_HEIGHT / 2

  /**
   * 创建/复用 PIXI Application
   */
  async function getOrCreateApp(canvas: HTMLCanvasElement): Promise<PIXI.Application> {
    if (app) {
      if (model) {
        app.stage.removeChild(model)
        model.destroy({ children: true })
        model = null
      }
      return app
    }

    const pixiApp = new PIXI.Application({
      view: canvas,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    app = pixiApp
    return pixiApp
  }

  /**
   * 加载模型 — FileLoader 模式：传 File[] 数组
   *
   * @param files 模型依赖的所有文件，每个 File 设置了正确的 webkitRelativePath
   */
  async function loadModel(files: File[]): Promise<void> {
    isLoading.value = true
    error.value = null
    isLoaded.value = false

    // 清理旧模型
    if (model && app) {
      app.stage.removeChild(model)
      model.destroy({ children: true })
      model = null
    }

    try {
      const canvas = canvasRef.value
      if (!canvas) throw new Error('Canvas 元素未就绪')

      const pixiApp = await getOrCreateApp(canvas)

      console.log(`[Live2D] 开始加载模型 (FileLoader模式), 文件数: ${files.length}`)

      // ★ 核心：FileLoader 模式
      // FileLoader.factory 会检查 context.source 是 File[] 数组，
      // 然后自动创建 settings、验证文件、生成 Blob URL。
      model = await Live2DModel.from(files as any, {
        autoInteract: false,
      }) as InstanceType<typeof Live2DModel>

      // ★ 验证：检查内部模型是否正确初始化了动作和表情
      const im = (model as any).internalModel
      const motionDefKeys = im?.motionManager?.definitions
        ? Object.keys(im.motionManager.definitions)
        : []
      const exprDefs = im?.motionManager?.expressionManager?.definitions || []
      console.log('[Live2D] 模型加载成功!')
      console.log(`[Live2D] 动作分组: ${motionDefKeys.join(', ') || '(无)'}`)
      console.log(`[Live2D] 表情: ${exprDefs.map((e: any) => e.name).join(', ') || '(无)'}`)

      model.interactive = true

      // 添加到舞台（先隐藏，等模型内部初始化后定位再显示）
      pixiApp.stage.addChild(model)
      model.visible = false

      // 等 1 帧让模型内部完成更新（model.width/height 稳定）
      requestAnimationFrame(() => {
        if (!model) return
        fitToCanvas()
        initialScale = scale.value
        model.visible = true
        isLoaded.value = true
        isLoading.value = false
      })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[Live2D] 模型加载失败:', errMsg)
      error.value = errMsg
      isLoading.value = false
    }
  }

  /**
   * 播放动作（与 WebGAL 完全一致）
   */
  async function playMotion(groupName: string, index: number): Promise<void> {
    if (!model) {
      console.warn('[Live2D] 播放动作失败: model 为 null')
      return
    }
    try {
      const mm = model.internalModel.motionManager
      mm.stopAllMotions()
      const success = await model.motion(groupName, index, MotionPriority.FORCE)
      console.log(`[Live2D] 播放动作: ${groupName}[${index}] → ${success ? '成功' : '失败'}`)
    } catch (e) {
      console.warn('[Live2D] 播放动作失败:', e)
    }
  }

  /**
   * 设置表情（与 WebGAL 完全一致）
   */
  async function setExpression(expressionID: string): Promise<void> {
    if (!model) return
    try {
      const success = await model.expression(expressionID)
      console.log(`[Live2D] 设置表情: ${expressionID} → ${success ? '成功' : '失败'}`)
    } catch (e) {
      console.warn('[Live2D] 设置表情失败:', e)
    }
  }

  /**
   * 基于固定舞台尺寸缩放居中
   */
  function fitToCanvas(): void {
    if (!model) return
    const scaleX = STAGE_WIDTH / model.width
    const scaleY = STAGE_HEIGHT / model.height
    const targetScale = Math.min(scaleX, scaleY) * 0.85
    const finalScale = Math.max(0.1, Math.min(3.0, targetScale))
    scale.value = finalScale
    model.scale.set(finalScale)
    model.anchor.set(0.5, 0.5)
    model.position.set(STAGE_WIDTH / 2, STAGE_HEIGHT / 2)
    model.rotation = 0
  }

  /**
   * 重置变换
   */
  function resetTransform(): void {
    if (!model) return
    scale.value = initialScale
    model.scale.set(initialScale)
    model.anchor.set(0.5, 0.5)
    model.position.set(initialX, initialY)
    posX.value = 0
    posY.value = 0
    model.rotation = 0
    rotation.value = 0
  }

  function applyScale(delta: number): void {
    if (!model) return
    const newScale = Math.max(0.1, Math.min(5.0, scale.value + delta))
    scale.value = newScale
    model.scale.set(newScale)
  }

  function applyTranslate(dx: number, dy: number): void {
    if (!model) return
    model.position.set(model.position.x + dx, model.position.y + dy)
    posX.value = Math.round(model.position.x - initialX)
    posY.value = Math.round(model.position.y - initialY)
  }

  function applyRotate(angleDelta: number): void {
    if (!model) return
    model.rotation += angleDelta
    rotation.value = Math.round((model.rotation * 180) / Math.PI)
  }

  function setFocus(nx: number, ny: number): void {
    const fc = model?.internalModel?.focusController
    if (!fc) return
    fc.focus(nx, ny)
  }

  function stopFocus(): void {
    setFocus(0, 0)
  }

  function release(): void {
    if (model && app) {
      app.stage.removeChild(model)
      model.destroy({ children: true })
      model = null
    }
    isLoaded.value = false
    error.value = null
  }

  function destroy(): void {
    release()
    if (app) {
      app.destroy(true, { children: true })
      app = null
    }
  }

  onUnmounted(() => {
    destroy()
  })

  return {
    isLoading,
    error,
    isLoaded,
    scale,
    posX,
    posY,
    rotation,
    offsetX: ref(0),
    offsetY: ref(0),
    loadModel,       // ← 签名变为 (files: File[])
    playMotion,
    setExpression,
    resetTransform,
    fitToCanvas,
    applyScale,
    applyTranslate,
    applyRotate,
    setFocus,
    stopFocus,
    release,
  }
}
