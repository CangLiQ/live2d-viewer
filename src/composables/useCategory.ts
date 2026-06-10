import type { ScannedModel } from '@/types/model'

/* ==================== 角色分类 ==================== */

/** 角色配置：英文名 -> 中文名、别名 */
const CHARACTER_CONFIG: Record<string, { label: string; aliases: string[] }> = {
  anon:    { label: '千早爱音', aliases: ['爱音'] },
  mana:    { label: '纯田真奈', aliases: ['真奈'] },
  mutsumi: { label: '若叶睦',   aliases: ['睦'] },
  nyamu:   { label: '祐天寺若麦', aliases: ['若麦', '喵梦'] },
  rana:    { label: '要乐奈',   aliases: ['乐奈'] },
  sakiko:  { label: '丰川祥子', aliases: ['祥子'] },
  soyo:    { label: '长崎素世', aliases: ['素世'] },
  taki:    { label: '椎名立希', aliases: ['立希'] },
  tomori:  { label: '高松灯',   aliases: ['灯'] },
  uika:    { label: '三角初华', aliases: ['初华'] },
  umiri:   { label: '八幡海铃', aliases: ['海铃'] },
}

/** 所有角色英文名集合 */
const CHARACTER_KEYS = new Set(Object.keys(CHARACTER_CONFIG))

/** 搜索词列表（按长度降序，优先匹配长词如"长崎素世"而非"素世"） */
const SEARCH_TERMS: { term: string; key: string }[] = []
for (const [key, cfg] of Object.entries(CHARACTER_CONFIG)) {
  SEARCH_TERMS.push({ term: key.toLowerCase(), key })
  for (const alias of cfg.aliases) {
    SEARCH_TERMS.push({ term: alias.toLowerCase(), key })
  }
}
SEARCH_TERMS.sort((a, b) => b.term.length - a.term.length)

/** 在文本中查找第一个匹配的角色键名（子串模糊匹配） */
function findBestMatch(text: string): string | null {
  const lower = text.toLowerCase()
  for (const { term, key } of SEARCH_TERMS) {
    if (lower.includes(term)) return key
  }
  return null
}

/**
 * 构建角色分类
 * 同时检查模型名称和路径中的每一级文件夹名（子串模糊匹配，大小写不敏感）
 * 取路径中最深位置的匹配
 */
export function buildCharacterGroups(models: ScannedModel[]): Record<string, ScannedModel[]> {
  const groups: Record<string, ScannedModel[]> = {}
  const other: ScannedModel[] = []

  for (const model of models) {
    let matchedKey: string | null = null

    // 1. 检查模型名称
    if (model.name) {
      matchedKey = findBestMatch(model.name)
    }

    // 2. 检查路径中的每一级（更深位置会覆盖名称匹配）
    const path = model.relativePath.replace(/\\/g, '/')
    const parts = path.split('/')
    for (const part of parts) {
      const m = findBestMatch(part)
      if (m) matchedKey = m
    }

    if (matchedKey) {
      if (!groups[matchedKey]) groups[matchedKey] = []
      groups[matchedKey].push(model)
    } else {
      other.push(model)
    }
  }

  // 按角色在配置中的顺序排序
  const ordered: Record<string, ScannedModel[]> = {}
  for (const key of Object.keys(CHARACTER_CONFIG)) {
    if (groups[key]) ordered[key] = groups[key]
  }
  if (other.length > 0) ordered.other = other

  return ordered
}

/** 获取角色的中文显示名 */
export function getCharacterLabel(key: string): string {
  return CHARACTER_CONFIG[key]?.label ?? '其他'
}

/** 获取所有角色配置 */
export function getCharacterConfig() {
  return CHARACTER_CONFIG
}

/* ==================== 文件夹分类树 ==================== */

export interface CategoryNode {
  label: string
  key: string
  type: 'folder' | 'model'
  children?: CategoryNode[]
  models?: ScannedModel[]
}

/**
 * 从模型的 relativePath 中提取 figure 后的路径部分
 * relativePath 示例: "figure/anon/casual-2023"
 * 返回 ["anon", "casual-2023"]
 */
function getPathSegments(relativePath: string): string[] {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  const figureIdx = parts.indexOf('figure')
  if (figureIdx !== -1) {
    return parts.slice(figureIdx + 1)
  }
  return parts
}

/**
 * 判断路径段是否为官方角色名
 */
function isOfficialCharacter(name: string): boolean {
  return CHARACTER_KEYS.has(name.toLowerCase())
}

/**
 * 递归构建普通分类的子节点
 *
 * depth 定义（从 childPrefix 开始计算 remaining.length）：
 *   depth = 0：该分组本身就是模型文件夹
 *   depth = 1：该分组下只有一层模型文件夹
 *   depth = 2：该分组下既有 depth=0 又有 depth>0 的模型（混合情况）
 *   depth > 2：该分组下还有多层
 *
 * 规则A：当前层级既有 directModels（remaining.length === 0）或 depth=0 的分组，
 *        又有 depth>=1 的分组时，创建同名子分类收纳直接模型
 */
function buildCategoryNodes(models: ScannedModel[], prefix: string): CategoryNode[] {
  const groups = new Map<string, ScannedModel[]>()
  const directModels: ScannedModel[] = []

  for (const model of models) {
    const segs = getPathSegments(model.relativePath)
    const prefixParts = prefix.split('/').filter(Boolean)
    const remaining = segs.slice(prefixParts.length)

    if (remaining.length === 0) {
      directModels.push(model)
    } else {
      const firstSeg = remaining[0]
      if (!groups.has(firstSeg)) groups.set(firstSeg, [])
      groups.get(firstSeg)!.push(model)
    }
  }

  const nodes: CategoryNode[] = []

  // 计算每个分组的 depth（从 childPrefix 开始）
  const groupDepths = new Map<string, number>()
  for (const [seg, groupModels] of groups) {
    const childPrefix = prefix ? `${prefix}/${seg}` : seg
    const depths = groupModels.map(model => {
      const segs = getPathSegments(model.relativePath)
      const prefixParts = childPrefix.split('/').filter(Boolean)
      const remaining = segs.slice(prefixParts.length)
      return remaining.length
    })

    // 检查分组内部是否有混合情况
    const hasDirectInGroup = depths.some(d => d === 0)
    const hasDeeperInGroup = depths.some(d => d > 0)

    if (hasDirectInGroup && hasDeeperInGroup) {
      groupDepths.set(seg, 2) // 混合情况
    } else {
      groupDepths.set(seg, Math.max(...depths))
    }
  }

  // 规则A的条件：有 directModels 或 depth=0 的分组，且有 depth>=1 的分组
  const hasDirectOnly = directModels.length > 0 || Array.from(groupDepths.values()).some(d => d === 0)
  const hasDeeperGroups = Array.from(groupDepths.values()).some(d => d >= 1)

  if (hasDirectOnly && hasDeeperGroups) {
    // 规则A：创建同名子分类收纳所有直接模型
    const allDirectModels: ScannedModel[] = [...directModels]

    for (const [seg, groupModels] of groups) {
      if (groupDepths.get(seg) === 0) {
        allDirectModels.push(...groupModels)
      }
    }

    nodes.push({
      label: prefix.split('/').pop() || prefix,
      key: prefix,
      type: 'model',
      models: allDirectModels,
    })
  }

  // 处理 directModels（如果没有应用规则A但也没有深层分组）
  if (directModels.length > 0 && !hasDeeperGroups) {
    nodes.push({
      label: prefix.split('/').pop() || prefix,
      key: prefix,
      type: 'model',
      models: directModels,
    })
  }

  // 处理每个分组
  for (const [seg, groupModels] of groups) {
    const depth = groupDepths.get(seg)!
    const childPrefix = prefix ? `${prefix}/${seg}` : seg

    if (depth === 0) {
      // 叶子节点（本身就是模型文件夹）
      if (hasDirectOnly && hasDeeperGroups) continue // 已放入同名子分类

      nodes.push({
        label: seg,
        key: childPrefix,
        type: 'model',
        models: groupModels,
      })
    } else if (depth === 1) {
      // 叶子节点（该分组下只有一层，直接显示该层下的所有模型）
      nodes.push({
        label: seg,
        key: childPrefix,
        type: 'model',
        models: groupModels,
      })
    } else {
      // 文件夹节点，递归构建
      const children = buildCategoryNodes(groupModels, childPrefix)
      nodes.push({
        label: seg,
        key: childPrefix,
        type: 'folder',
        children,
      })
    }
  }

  return nodes
}

/**
 * 构建文件夹分类树（根节点列表）
 */
export function buildFolderTree(models: ScannedModel[]): CategoryNode[] {
  const roots = new Map<string, ScannedModel[]>()

  for (const model of models) {
    const segs = getPathSegments(model.relativePath)
    if (segs.length === 0) continue

    const firstSeg = segs[0]

    // 判断是否为官方角色名
    if (isOfficialCharacter(firstSeg)) {
      if (!roots.has('官方')) roots.set('官方', [])
      roots.get('官方')!.push(model)
    } else {
      if (!roots.has(firstSeg)) roots.set(firstSeg, [])
      roots.get(firstSeg)!.push(model)
    }
  }

  const rootNodes: CategoryNode[] = []

  for (const [rootName, rootModels] of roots) {
    if (rootName === '官方') {
      const officialChildren: CategoryNode[] = []
      const byCharacter = new Map<string, ScannedModel[]>()

      for (const model of rootModels) {
        const segs = getPathSegments(model.relativePath)
        if (segs.length >= 1) {
          const charKey = segs[0].toLowerCase()
          if (!byCharacter.has(charKey)) byCharacter.set(charKey, [])
          byCharacter.get(charKey)!.push(model)
        }
      }

      for (const [charKey, charModels] of byCharacter) {
        if (CHARACTER_CONFIG[charKey]) {
          // 角色名节点直接作为叶子（type='model'），存放该角色所有模型
          officialChildren.push({
            label: CHARACTER_CONFIG[charKey].label,
            key: `官方/${charKey}`,
            type: 'model',
            models: charModels,
          })
        }
      }

      rootNodes.push({
        label: '官方',
        key: '官方',
        type: 'folder',
        children: officialChildren,
        models: rootModels,
      })
    } else {
      const childNodes = buildCategoryNodes(rootModels, rootName)
      const allModels = collectAllModels(childNodes)
      rootNodes.push({
        label: rootName,
        key: rootName,
        type: 'folder',
        children: childNodes.length > 0 ? childNodes : undefined,
        models: allModels,
      })
    }
  }

  return rootNodes
}

/** 递归收集节点下所有模型 */
function collectAllModels(nodes: CategoryNode[]): ScannedModel[] {
  const result: ScannedModel[] = []
  for (const node of nodes) {
    if (node.models) result.push(...node.models)
    if (node.children) result.push(...collectAllModels(node.children))
  }
  return result
}

/** 计算节点的模型总数 */
export function countModels(node: CategoryNode): number {
  let count = node.models?.length ?? 0
  if (node.children) {
    for (const child of node.children) {
      count += countModels(child)
    }
  }
  return count
}
