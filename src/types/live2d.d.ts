/**
 * pixi-live2d-display (Cubism 2.1) 类型声明
 * 基于 pixi-live2d-display v0.4.x（配合 PIXI v6 使用）
 *
 * 参照官方 node_modules/pixi-live2d-display/types/index.d.ts 中的真实 API
 */
declare module 'pixi-live2d-display/cubism2' {
  import { Container } from 'pixi.js'

  /** 视线焦点控制器（WebGAL 同款 API） */
  export interface FocusController {
    targetX: number
    targetY: number
    x: number
    y: number
    focus(x: number, y: number, instant?: boolean): void
  }

  /**
   * 动作优先级枚举
   * 参考：node_modules/pixi-live2d-display/types/index.d.ts L515-524
   */
  export enum MotionPriority {
    NONE = 0,
    IDLE = 1,
    NORMAL = 2,
    FORCE = 3,
  }

  /** Cubism 2 动作管理器 */
  export class Cubism2MotionManager {
    stopAllMotions(): void
    /** 动作定义（从 settings.motions 直接引用） */
    definitions: Record<string, Array<{ file: string; sound?: string; fade_in?: number; fade_out?: number; text?: string }>>
    /** 表情管理器（可能为 undefined） */
    expressionManager?: Cubism2ExpressionManager
  }

  /** Cubism 2 表情管理器 */
  export class Cubism2ExpressionManager {
    definitions: Array<{ name: string; file: string }>
  }

  /** Cubism 2 内部模型 */
  export interface Cubism2InternalModel {
    motionManager: Cubism2MotionManager
    focusController?: FocusController
  }

  /**
   * 模型设置抽象类（来自 pixi-live2d-display/types/index.d.ts L432）
   * 用于 FileLoader 的 resolveURL monkey-patch
   */
  export class ModelSettings {
    /** 模型 settings.json/model.json 的 URL 路径 */
    url: string
    /** .moc 文件路径（相对 url） */
    moc: string
    /** 贴图文件路径数组 */
    textures: string[]
    /** 内部 objectURL（由 FileLoader 设置） */
    _objectURL?: string

    /**
     * 解析相对路径为绝对路径
     * @param path - 相对路径（如 ".chara/model.moc"）
     * @returns 解析后的绝对路径
     */
    resolveURL(path: string): string
  }

  export class Live2DModel extends Container {
    /**
     * 从 URL 字符串或配置对象加载模型
     * - 传入字符串：model.json 的 URL 路径
     * - 传入对象：必须包含 url 字段 + model.json 的完整内容
     */
    static from(
      source: string | Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<Live2DModel>

    /**
     * 内部模型接口
     * 用于底层动作/表情/视线控制
     */
    internalModel: Cubism2InternalModel

    /** 是否启用内置自动交互（视线追踪等） */
    autoInteract: boolean

    /**
     * PIXI anchor 属性（继承自 Container，Live2D 特有）
     * 用于设置模型的锚点位置（0.5, 0.5 = 居中）
     */
    anchor: { set(x: number, y: number): void; x: number; y: number }

    /**
     * 播放指定分组的动作
     * @param group - 动作分组名称（如 "tap_body"）
     * @param index - 在分组中的索引
     * @param priority - 优先级（默认 NORMAL，FORCE=3 强制播放）
     * @returns Promise<boolean> 播放是否成功
     *
     * 参考：node_modules/pixi-live2d-display/types/index.d.ts L1606
     */
    motion(group: string, index?: number, priority?: MotionPriority): Promise<boolean>

    /**
     * 设置表情
     * @param id - 表情 ID（字符串名称或数字索引）
     * @returns Promise<boolean> 设置是否成功
     *
     * 参考：node_modules/pixi-live2d-display/types/index.d.ts L1612
     */
    expression(id?: number | string): Promise<boolean>

    /** 动作分组列表（来自 model.json） */
    motions?: Record<string, Array<{ file: string; text?: string }>>

    /** 表情列表（来自 model.json） */
    expressions?: Array<{ name: string; file: string }>
  }
}