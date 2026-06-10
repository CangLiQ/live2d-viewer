import type { ScannedModel, ModelConfig } from '@/types/model'

/** IndexedDB 数据库名和版本 */
const DB_NAME = 'Live2DViewerDB'
const DB_VERSION = 3
const STORE_NAME = 'session'
const FILE_CACHE_STORE = 'fileCache'

/**
 * 可序列化的模型缓存（不含 directoryHandle 和 files）
 */
export interface CachedModelData {
  id: string
  name: string
  config: ModelConfig
  motionCount: number
  expressionCount: number
  relativePath: string
}

interface SessionData {
  id: 'session'
  rootHandle: FileSystemDirectoryHandle | null
  models: CachedModelData[]
  selectedModelId: string | null
}

interface FileCacheEntry {
  id: 'fileCache'
  modelId: string | null
  files: Array<{ path: string; data: Blob }>
}

/** 打开 IndexedDB 数据库 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(FILE_CACHE_STORE)) {
        db.createObjectStore(FILE_CACHE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 保存目录句柄 + 模型缓存到 IndexedDB
 */
export async function saveSession(
  handle: FileSystemDirectoryHandle,
  models: ScannedModel[],
  selectedModelId?: string | null
): Promise<void> {
  try {
    const cachedModels: CachedModelData[] = models.map((m) => ({
      id: m.id,
      name: m.name,
      config: m.config,
      motionCount: m.motionCount,
      expressionCount: m.expressionCount,
      relativePath: m.relativePath,
    }))

    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({
      id: 'session',
      rootHandle: handle,
      models: cachedModels,
      selectedModelId: selectedModelId ?? null,
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    console.warn('[Persistence] 保存会话失败:', e)
  }
}

/**
 * 从 IndexedDB 加载缓存的模型数据
 * 返回 { rootHandle, models, selectedModelId }，models 不含 files
 */
export async function loadSession(): Promise<{
  rootHandle: FileSystemDirectoryHandle | null
  models: CachedModelData[]
  selectedModelId: string | null
} | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const result = await new Promise<SessionData | undefined>((resolve, reject) => {
      const req = store.get('session')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()

    if (!result || !result.models || result.models.length === 0) return null
    return {
      rootHandle: result.rootHandle ?? null,
      models: result.models,
      selectedModelId: result.selectedModelId ?? null,
    }
  } catch (e) {
    console.warn('[Persistence] 读取会话失败:', e)
    return null
  }
}

/**
 * 缓存已加载的模型文件（仅缓存最近一个模型的 files）
 * 使用 Blob 存储，File 对象无法直接序列化
 */
export async function saveFileCache(
  modelId: string,
  files: File[]
): Promise<void> {
  try {
    const fileEntries = files.map((f) => ({
      path: f.webkitRelativePath || f.name,
      data: f.slice() as Blob,
    }))

    const db = await openDB()
    const tx = db.transaction(FILE_CACHE_STORE, 'readwrite')
    tx.objectStore(FILE_CACHE_STORE).put({
      id: 'fileCache',
      modelId,
      files: fileEntries,
    } satisfies FileCacheEntry)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    console.warn('[Persistence] 保存文件缓存失败:', e)
  }
}

/**
 * 从 IndexedDB 加载缓存的模型文件
 * 返回 File[]（若 modelId 不匹配则返回 null）
 */
export async function loadFileCache(
  modelId: string
): Promise<File[] | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(FILE_CACHE_STORE, 'readonly')
    const store = tx.objectStore(FILE_CACHE_STORE)
    const result = await new Promise<FileCacheEntry | undefined>((resolve, reject) => {
      const req = store.get('fileCache')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()

    if (!result || result.modelId !== modelId || !result.files) return null

    // 从 Blob 重建 File 对象
    return result.files.map((entry) => {
      const fileName = entry.path.split('/').pop() || 'unknown'
      const file = new File([entry.data], fileName)
      Object.defineProperty(file, 'webkitRelativePath', {
        value: entry.path,
        writable: false,
      })
      return file
    })
  } catch (e) {
    console.warn('[Persistence] 读取文件缓存失败:', e)
    return null
  }
}

/**
 * 检查目录句柄是否仍有读取权限
 */
export async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    // @ts-expect-error File System Access API
    const opts = { mode: 'read' as FileSystemPermissionMode }
    // @ts-expect-error File System Access API
    const result = await handle.queryPermission(opts)
    if (result === 'granted') return true
    // @ts-expect-error File System Access API
    const promptResult = await handle.requestPermission(opts)
    return promptResult === 'granted'
  } catch {
    return false
  }
}

/**
 * 清除所有持久化数据（会话 + 文件缓存）
 */
export async function clearSession(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_NAME, FILE_CACHE_STORE], 'readwrite')
    tx.objectStore(STORE_NAME).delete('session')
    tx.objectStore(FILE_CACHE_STORE).delete('fileCache')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    console.warn('[Persistence] 清除会话失败:', e)
  }
}
