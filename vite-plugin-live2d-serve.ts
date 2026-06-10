/**
 * Live2D 模型文件服务插件
 *
 * ★ 设计思路：用 URL.createObjectURL(File) 直接生成 Blob URL，
 *   无需上传到服务器，零拷贝，与 WebGAL 的 URL 加载模式完全一致。
 */

import type { Plugin } from 'vite'

export function createLive2dServePlugin(): Plugin {
  return {
    name: 'live2d-serve',
    // 这个插件不需要在服务器端做任何事，
    // 所有文件服务通过 URL.createObjectURL 在客户端完成
    configureServer() {
      // 空实现 — 所有文件服务在客户端完成
    },
  }
}
