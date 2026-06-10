/**
 * model.json 中的动作项
 */
export interface MotionItem {
  file: string
  text?: string
}

/**
 * model.json 中的表情项
 */
export interface ExpressionItem {
  name: string
  file: string
}

/**
 * 解析后的 model.json 配置
 */
export interface ModelConfig {
  name?: string
  model: string
  textures: string[]
  motions?: Record<string, MotionItem[]>
  expressions?: ExpressionItem[]
  physics?: string
  pose?: string
}

/**
 * 扫描到的单个模型信息
 */
export interface ScannedModel {
  id: string
  name: string
  directoryHandle: FileSystemDirectoryHandle
  config: ModelConfig
  motionCount: number
  expressionCount: number
  relativePath: string
  /** ★ File[] 数组（用于 FileLoader 模式加载） */
  files: File[]
  /** 超出根目录的缺失文件路径 */
  missingOutsideRoot?: string[]
}
