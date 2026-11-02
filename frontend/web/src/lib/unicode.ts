// Unicode 码空间的分类、取色与查询逻辑
import { unicodeBlocks, UNICODE_VERSION } from '../data/blocks'
import type { HanBlockInfo, HanCategory } from '../data/hanBlocks'
import { hanBlockIndex } from '../data/hanBlocks'

/** 渲染用的桶类别 */
export type Bucket = HanCategory | 'other' | 'pua' | 'none'

export const PLANE_COUNT = 17
export const PLANE_SIZE = 0x10000

export interface PlaneMeta {
  id: number
  abbr: string
  zh: string
  note?: string
}

export const PLANES: readonly PlaneMeta[] = [
  { id: 0, abbr: 'BMP', zh: '基本多文种平面', note: '汉字基本区、扩展 A、兼容区所在' },
  { id: 1, abbr: 'SMP', zh: '增补多文种平面', note: '西夏、契丹、女真、女书等汉字系文字' },
  { id: 2, abbr: 'SIP', zh: '表意文字增补平面', note: '扩展 B/C/D/E/F/I 与兼容补充' },
  { id: 3, abbr: 'TIP', zh: '第三表意文字平面', note: '扩展 G/H/J 与小篆 Seal' },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: 4 + i,
    abbr: `P${4 + i}`,
    zh: '未分配',
    note: '尚无任何字符',
  })),
  { id: 14, abbr: 'SSP', zh: '增补特殊用途平面', note: '标签、变体选择符' },
  { id: 15, abbr: 'PUA-A', zh: '私人使用区 A' },
  { id: 16, abbr: 'PUA-B', zh: '私人使用区 B' },
]

/** 各桶的展示配置 */
export const BUCKET_META: Record<Bucket, { label: string; color: string }> = {
  unified: { label: '统一表意文字（汉字本体）', color: '#ff5a52' },
  compat: { label: '兼容表意文字', color: '#ff9738' },
  aux: { label: '汉字辅助（部首/笔画/注音/符号）', color: '#ffd23f' },
  seal: { label: '小篆 Seal（18.0 新增）', color: '#b06bff' },
  siniform: { label: '汉字系文字（西夏/契丹/女真/女书）', color: '#2dd4bf' },
  other: { label: '其他文字区块', color: '#3d5166' },
  pua: { label: '私人使用区', color: '#232a38' },
  none: { label: '未分配', color: '#0e1219' },
}

const PUA_NAMES = new Set([
  'Private Use Area',
  'Supplementary Private Use Area-A',
  'Supplementary Private Use Area-B',
])

/** 官方区块名 → 渲染桶 */
export function bucketOfBlock(name: string): Bucket {
  if (PUA_NAMES.has(name)) return 'pua'
  // 汉字相关区块已在 hanBlockIndex 登记类别
  const han = hanBlockIndex.get(name)
  if (han) return han.category
  return 'other'
}

/** 展示用版本号（如 18.0） */
export const UNICODE_VERSION_LABEL = UNICODE_VERSION.replace(/\.\d+$/, '')

/** 汉字相关区块按起始码位排序（含原始范围，用于绘制） */
export const hanBlocksSorted: readonly HanBlockInfo[] = [...hanBlockIndex.values()].sort(
  (a, b) => a.start - b.start,
)

/** 每个码位一个桶号（懒加载，1.1MB Uint8Array） */
let cpBucket: Uint8Array | null = null
const bucketCodes: Bucket[] = [
  'none',
  'unified',
  'compat',
  'aux',
  'seal',
  'siniform',
  'other',
  'pua',
]
const codeOf = new Map<Bucket, number>(bucketCodes.map((b, i) => [b, i]))

function ensureCpBucket(): Uint8Array {
  if (cpBucket) return cpBucket
  const arr = new Uint8Array(PLANE_COUNT * PLANE_SIZE)
  for (const [start, end, name] of unicodeBlocks) {
    const code = codeOf.get(bucketOfBlock(name)) ?? 0
    arr.fill(code, start, end + 1)
  }
  cpBucket = arr
  return arr
}

/** 码位 → 渲染桶（O(1)） */
export function bucketAt(cp: number): Bucket {
  return bucketCodes[ensureCpBucket()[cp]] ?? 'none'
}

/** 码位 → 官方原始区块（二分查找） */
export function rawBlockAt(cp: number): { start: number; end: number; name: string } | null {
  let lo = 0
  let hi = unicodeBlocks.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [s, e, n] = unicodeBlocks[mid]
    if (cp < s) hi = mid - 1
    else if (cp > e) lo = mid + 1
    else return { start: s, end: e, name: n }
  }
  return null
}

/** 码位 → 覆盖它的汉字相关区块（含小篆/汉字系） */
export function hanBlockAt(cp: number): HanBlockInfo | null {
  for (const b of hanBlocksSorted) {
    if (cp < b.start) break
    if (cp <= b.end) return b
  }
  return null
}

/** 数值 → U+XXXX 大写十六进制 */
export const hex = (cp: number) => 'U+' + cp.toString(16).toUpperCase()
