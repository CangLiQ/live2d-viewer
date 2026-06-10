import type { ScannedModel, ModelConfig } from '@/types/model'

/**
 * 文件夹扫描 composable（高性能版 v4）
 *
 * ★ 核心优化：
 *   1. 阶段1：BFS 遍历目录，定位所有包含 model.json 的目录（保留目录句柄）
 *   2. 阶段2：利用阶段1取得的模型目录句柄直接读取文件（无需从根导航）
 *      - 模型自身目录内的文件（model.json, .moc, 纹理等）：直接从 handle 读取
 *      - 跨目录文件（../../）：才从根导航
 *   3. 高性能并发：信号量 20，批次 8 并行
 *   4. 扫秒即所有文件就绪，加载模型无需二次 I/O
 */

/** 扫描进度回调 */
export interface ScanProgress {
  phase: 'locating' | 'parsing' | 'done'
  current: number
  total: number
  message: string
}

type ProgressCallback = (progress: ScanProgress) => void

/** 让出主线程控制权 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** 解析相对路径 */
function resolveRelativePath(basePath: string, relativePath: string): string {
  const baseParts = basePath.replace(/\\/g, '/').split('/').filter((p) => p !== '')
  const relParts = relativePath.replace(/\\/g, '/').split('/')
  for (const part of relParts) {
    if (part === '..') baseParts.pop()
    else if (part !== '.' && part !== '') baseParts.push(part)
  }
  return baseParts.join('/')
}

/** 为 File 对象设置 webkitRelativePath */
function setWebkitRelativePath(file: File, path: string): File {
  Object.defineProperty(file, 'webkitRelativePath', { value: path, writable: false, configurable: true })
  return file
}

/**
 * 阶段1：迭代式 BFS 遍历目录树
 */
async function locateModels(
  rootHandle: FileSystemDirectoryHandle,
  onProgress: ProgressCallback
): Promise<Array<{ handle: FileSystemDirectoryHandle; path: string }>> {
  const results: Array<{ handle: FileSystemDirectoryHandle; path: string }> = []
  const queue: Array<{ handle: FileSystemDirectoryHandle; path: string }> = [
    { handle: rootHandle, path: '' },
  ]
  let dirCount = 0
  const YIELD_INTERVAL = 30

  while (queue.length > 0) {
    const { handle: currentHandle, path: currentPath } = queue.shift()!

    const entries: FileSystemHandle[] = []
    for await (const entry of currentHandle.values()) {
      if (entry.name === '.mtn_exp') continue
      entries.push(entry)
    }

    for (const entry of entries) {
      if (entry.kind === 'directory') {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
        queue.push({ handle: entry as FileSystemDirectoryHandle, path: entryPath })
      }
    }

    if (entries.some((e) => e.kind === 'file' && e.name === 'model.json')) {
      results.push({ handle: currentHandle, path: currentPath })
    }

    dirCount++
    if (dirCount % YIELD_INTERVAL === 0) {
      onProgress({
        phase: 'locating',
        current: results.length,
        total: dirCount,
        message: `已扫描 ${dirCount} 个目录...`,
      })
      await yieldToMain()
    }
  }

  onProgress({
    phase: 'locating',
    current: results.length,
    total: dirCount,
    message: `发现 ${results.length} 个模型`,
  })

  return results
}

/**
 * 文件读取信号量
 */
class FileReadSemaphore {
  private running = 0
  private queue: Array<() => void> = []
  private maxConcurrent: number
  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
  }

  private release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) {
      this.running++
      next()
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }
}

/** 全局信号量（提升并发数） */
const globalSemaphore = new FileReadSemaphore(30)

/**
 * 按绝对路径去重的内存文件缓存（跨模型持久化）
 * key: 相对于根的完整路径
 * value: File | null（null 表示该路径读取失败过）
 *
 * ★ 关键优化：缓存在整个会话期间保持，不清空！
 *   - 切换模型时，公共文件（表情/动作/纹理）直接从内存获取，零 I/O
 *   - 只在重新扫描目录时才清空（scanDirectory 开头）
 */
const fileReadCache = new Map<string, File | null>()

/** 仅在重新扫描目录时调用，清空文件缓存 */
function resetFileCache(): void {
  fileReadCache.clear()
}

/**
 * 从模型目录句柄直接读取一个文件
 * path 是相对于根的完整路径（如 "改模/anon【果】/model.json"）
 * modelHandle 是模型所在目录的句柄
 * modelPath 是模型相对于根的路径（如 "改模/anon【果】"）
 *
 * ★ 按绝对路径去重缓存：同一路径的文件只读取一次
 */
async function readOneFile(
  path: string,
  rootHandle: FileSystemDirectoryHandle,
  modelHandle: FileSystemDirectoryHandle,
  modelPath: string
): Promise<File | null> {
  // ★ 缓存命中：直接返回，零 I/O
  const normalizedPath = path.replace(/\\/g, '/')
  const cached = fileReadCache.get(normalizedPath)
  if (cached !== undefined) return cached

  return globalSemaphore.run(async () => {
    try {
      // 判断是否在模型目录内：以 modelPath 开头
      if (modelPath && normalizedPath.startsWith(modelPath + '/')) {
        const relativePart = normalizedPath.slice(modelPath.length + 1)
        const parts = relativePart.split('/')
        let currentHandle: FileSystemDirectoryHandle = modelHandle
        for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i])
        }
        const fh = await currentHandle.getFileHandle(parts[parts.length - 1])
        const file = await fh.getFile()
        const result = setWebkitRelativePath(file, path)
        fileReadCache.set(normalizedPath, result)
        return result
      }

      // ★ 跨目录文件：从根导航
      const parts = normalizedPath.split('/')
      let currentHandle: FileSystemDirectoryHandle = rootHandle
      for (let i = 0; i < parts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(parts[i])
      }
      const fh = await currentHandle.getFileHandle(parts[parts.length - 1])
      const file = await fh.getFile()
      const result = setWebkitRelativePath(file, path)
      fileReadCache.set(normalizedPath, result)
      return result
    } catch {
      fileReadCache.set(normalizedPath, null)
      return null
    }
  })
}

/**
 * 解析单个模型：读 model.json + 收集所有依赖文件（一次完成）
 * @param useFullParse true=全解析模式（读取所有文件），false=半解析模式（仅读元数据）
 */
async function parseAndCollect(
  loc: { handle: FileSystemDirectoryHandle; path: string },
  rootHandle: FileSystemDirectoryHandle,
  _progressIndex: number,
  _total: number,
  _report: ProgressCallback,
  useFullParse: boolean
): Promise<ScannedModel | null> {
  try {
    // 1. 读 model.json
    const fh = await loc.handle.getFileHandle('model.json')
    const modelJsonFile = await fh.getFile()
    const text = await modelJsonFile.text()

    const parsed = JSON.parse(text) as ModelConfig
    const config = JSON.parse(JSON.stringify(parsed)) as ModelConfig

    let motionCount = 0
    if (config.motions) {
      for (const group of Object.values(config.motions)) motionCount += group.length
    }
    const expressionCount = config.expressions?.length ?? 0
    const modelName = config.name || loc.handle.name || '未命名模型'

    let files: File[] = []

    if (useFullParse) {
      // 全解析模式：收集所有依赖文件
      const neededPaths = new Set<string>()
      const basePath = loc.path

      neededPaths.add(`${basePath}/model.json`)
      if (config.model) neededPaths.add(resolveRelativePath(basePath, config.model))
      if (Array.isArray(config.textures)) {
        for (const tex of config.textures) neededPaths.add(resolveRelativePath(basePath, tex))
      }
      if (config.motions && typeof config.motions === 'object') {
        for (const items of Object.values(config.motions)) {
          if (Array.isArray(items)) {
            for (const item of items) neededPaths.add(resolveRelativePath(basePath, item.file))
          }
        }
      }
      if (Array.isArray(config.expressions)) {
        for (const exp of config.expressions) neededPaths.add(resolveRelativePath(basePath, exp.file))
      }
      if (config.physics && typeof config.physics === 'string') neededPaths.add(resolveRelativePath(basePath, config.physics))
      if (config.pose && typeof config.pose === 'string') neededPaths.add(resolveRelativePath(basePath, config.pose))

      // 并行读取所有文件（使用模型目录句柄加速）
      const filePromises = Array.from(neededPaths).map((path) =>
        readOneFile(path, rootHandle, loc.handle, basePath)
      )
      const resolved = await Promise.all(filePromises)
      files = resolved.filter((f): f is File => f !== null)
    }
    // 半解析模式：files 保持为空数组，点击模型时通过 lazyLoadModelFiles 按需加载

    return {
      id: crypto.randomUUID(),
      name: modelName,
      directoryHandle: loc.handle,
      config,
      motionCount,
      expressionCount,
      relativePath: loc.path,
      files,
      missingOutsideRoot: [],
    }
  } catch (e) {
    console.warn(`[FileScanner] 解析失败: ${loc.path}`, e)
    return null
  }
}

/**
 * 从根目录导航到模型的目录句柄
 */
async function getModelDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemDirectoryHandle> {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  let current = rootHandle
  for (const part of parts) {
    if (part) current = await current.getDirectoryHandle(part)
  }
  return current
}

/**
 * 为单个模型按需加载文件（懒加载）
 * 从缓存中恢复的模型 files 为空数组，调用此函数填充
 * 首次加载后缓存到 model.files，后续调用直接返回
 *
 * ★ 性能优化要点：
 *   1. 跨模型持久化缓存：不清空 fileReadCache，公共文件零 I/O
 *   2. 高并发分块：每批 16 个文件并行读取
 *   3. 支持取消：通过 AbortSignal 中断加载
 *
 * @param onProgress 进度回调，参数为百分比 0-100
 * @param signal 可选的 AbortSignal，用于取消加载
 */
export async function lazyLoadModelFiles(
  rootHandle: FileSystemDirectoryHandle,
  model: ScannedModel,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<File[]> {
  if (model.files.length > 0) return model.files

  const modelHandle = await getModelDirectoryHandle(rootHandle, model.relativePath)
  if (signal?.aborted) return []
  model.directoryHandle = modelHandle

  const neededPaths = new Set<string>()
  const basePath = model.relativePath

  neededPaths.add(`${basePath}/model.json`)
  if (model.config.model) neededPaths.add(resolveRelativePath(basePath, model.config.model))
  if (Array.isArray(model.config.textures)) {
    for (const tex of model.config.textures) neededPaths.add(resolveRelativePath(basePath, tex))
  }
  if (model.config.motions && typeof model.config.motions === 'object') {
    for (const items of Object.values(model.config.motions)) {
      if (Array.isArray(items)) {
        for (const item of items) neededPaths.add(resolveRelativePath(basePath, item.file))
      }
    }
  }
  if (Array.isArray(model.config.expressions)) {
    for (const exp of model.config.expressions) neededPaths.add(resolveRelativePath(basePath, exp.file))
  }
  if (model.config.physics && typeof model.config.physics === 'string') neededPaths.add(resolveRelativePath(basePath, model.config.physics))
  if (model.config.pose && typeof model.config.pose === 'string') neededPaths.add(resolveRelativePath(basePath, model.config.pose))

  const paths = Array.from(neededPaths)
  const files: File[] = []
  const totalFiles = paths.length

  // ★ 不再清空缓存！跨模型持久化，公共文件直接命中
  // resetFileCache() // 已移除 - 保持缓存跨模型共享

  // 分块加载，每批 16 个文件并发读取（提升吞吐量）
  const CHUNK_SIZE = 16
  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    // 每次迭代检查是否被取消
    if (signal?.aborted) return []

    const chunk = paths.slice(i, i + CHUNK_SIZE)
    const chunkResults = await Promise.all(
      chunk.map((path) => readOneFile(path, rootHandle, modelHandle, basePath))
    )
    for (const f of chunkResults) {
      if (f) files.push(f)
    }

    // 报告进度
    if (onProgress) {
      const loaded = Math.min(i + CHUNK_SIZE, totalFiles)
      const percent = Math.round((loaded / totalFiles) * 100)
      onProgress(percent)
    }

    // 让出主线程，避免卡顿
    await yieldToMain()
  }

  model.files = files // 内存缓存，会话内切换模型无需二次加载
  return files
}

/**
 * 预加载模型文件（用于 hover 时提前加载）
 * 与 lazyLoadModelFiles 共享 fileReadCache，不会重复读取
 * 被取消或中断时不影响后续正式加载（缓存已保留）
 *
 * @param signal 可选的 AbortSignal，用于取消预加载（如鼠标移开）
 */
export async function prefetchModelFiles(
  rootHandle: FileSystemDirectoryHandle,
  model: ScannedModel,
  signal?: AbortSignal
): Promise<void> {
  if (model.files.length > 0) return // 已加载过，跳过

  const modelHandle = await getModelDirectoryHandle(rootHandle, model.relativePath)
  if (signal?.aborted) return

  const neededPaths = new Set<string>()
  const basePath = model.relativePath

  neededPaths.add(`${basePath}/model.json`)
  if (model.config.model) neededPaths.add(resolveRelativePath(basePath, model.config.model))
  if (Array.isArray(model.config.textures)) {
    for (const tex of model.config.textures) neededPaths.add(resolveRelativePath(basePath, tex))
  }
  if (model.config.motions && typeof model.config.motions === 'object') {
    for (const items of Object.values(model.config.motions)) {
      if (Array.isArray(items)) {
        for (const item of items) neededPaths.add(resolveRelativePath(basePath, item.file))
      }
    }
  }
  if (Array.isArray(model.config.expressions)) {
    for (const exp of model.config.expressions) neededPaths.add(resolveRelativePath(basePath, exp.file))
  }
  if (model.config.physics && typeof model.config.physics === 'string') neededPaths.add(resolveRelativePath(basePath, model.config.physics))
  if (model.config.pose && typeof model.config.pose === 'string') neededPaths.add(resolveRelativePath(basePath, model.config.pose))

  const paths = Array.from(neededPaths)

  // 低优先级分块加载，每批 8 个文件（不影响主加载性能）
  const CHUNK_SIZE = 8
  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    if (signal?.aborted) return // 用户移开鼠标，取消预加载

    const chunk = paths.slice(i, CHUNK_SIZE)
    await Promise.all(
      chunk.map((path) => readOneFile(path, rootHandle, modelHandle, basePath))
    )

    // 让出主线程，避免阻塞 UI
    await yieldToMain()
  }

  // 预加载完成：将缓存中的文件收集到 model.files
  const files: File[] = []
  for (const path of paths) {
    const cached = fileReadCache.get(path.replace(/\\/g, '/'))
    if (cached) files.push(cached)
  }
  if (files.length > 0) {
    model.files = files
  }
}

export function useFileScanner() {
  async function scanDirectory(
    rootHandle: FileSystemDirectoryHandle,
    useFullParse: boolean,
    onProgress?: ProgressCallback
  ): Promise<ScannedModel[]> {
    const report = onProgress ?? (() => {})

    console.time('[FileScanner] 总耗时')

    // 清空文件缓存（全解析模式下跨模型共享文件只需读一次）
    resetFileCache()

    // ====== 阶段1：BFS 定位模型 ======
    report({ phase: 'locating', current: 0, total: 0, message: '正在扫描目录结构...' })
    console.time('[FileScanner] 阶段1: 定位模型')

    const modelLocations = await locateModels(rootHandle, report)

    console.timeEnd('[FileScanner] 阶段1: 定位模型')
    console.log(`[FileScanner] 发现 ${modelLocations.length} 个模型`)

    if (modelLocations.length === 0) {
      report({ phase: 'done', current: 0, total: 0, message: '未找到任何模型' })
      console.timeEnd('[FileScanner] 总耗时')
      return []
    }

    // ====== 阶段2：解析配置 + 收集文件（并行） ======
    report({
      phase: 'parsing',
      current: 0,
      total: modelLocations.length,
      message: `开始解析 ${modelLocations.length} 个模型...`,
    })
    console.time('[FileScanner] 阶段2: 解析+收集')

    const models: ScannedModel[] = []

    // 每批 8 个并行，每个模型的文件读取由全局信号量限流
    const BATCH = 8
    for (let i = 0; i < modelLocations.length; i += BATCH) {
      const batch = modelLocations.slice(i, i + BATCH)

      const batchResults = await Promise.all(
        batch.map((loc, batchIdx) =>
          parseAndCollect(loc, rootHandle, i + batchIdx, modelLocations.length, report, useFullParse)
        )
      )

      for (const m of batchResults) {
        if (m) {
          models.push(m)
        }
      }

      report({
        phase: 'parsing',
        current: Math.min(i + BATCH, modelLocations.length),
        total: modelLocations.length,
        message: `解析模型 (${Math.min(i + BATCH, modelLocations.length)}/${modelLocations.length})`,
      })

      await yieldToMain()
    }

    console.timeEnd('[FileScanner] 阶段2: 解析+收集')
    console.timeEnd('[FileScanner] 总耗时')

    report({
      phase: 'done',
      current: models.length,
      total: models.length,
      message: `扫描完成，共 ${models.length} 个模型`,
    })

    return models
  }

  async function pickAndScan(useFullParse: boolean, onProgress?: ProgressCallback): Promise<{
    rootHandle: FileSystemDirectoryHandle
    models: ScannedModel[]
  }> {
    // @ts-expect-error File System Access API
    if (!window.showDirectoryPicker) {
      throw new Error('您的浏览器不支持 File System Access API，请使用 Chrome/Edge 最新版本')
    }
    // @ts-expect-error File System Access API
    const rootHandle = await window.showDirectoryPicker({ mode: 'read' })
    const models = await scanDirectory(rootHandle, useFullParse, onProgress)
    return { rootHandle, models }
  }

  return { scanDirectory, pickAndScan }
}
