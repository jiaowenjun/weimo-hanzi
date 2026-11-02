// 码空间统一数据模型（Model）：三份 JSON 组装为内存中的 PlaneModel
//   planes.json      平面配置 + 图例分类 + 统计（人工维护）
//   blocks.json      官方 Blocks.txt 的区块范围（脚本生成）
//   block-meta.json  按官方区块名挂接的分类与中文详情（人工维护）
// 全景缩略图与区块详图共用同一 PlaneModel，仅以 cols/unit 两个尺度参数区分投影；
// 颜色/标签等展示配置归视图（CATEGORIES），几何（Rect/cpAtNorm）为两视图共享的纯函数
import planesFile from '../data/planes.json'
import blocksFile from '../data/blocks.json'
import blockMetaFile from '../data/block-meta.json'

/** 渲染分类（图例 id） */
export type CategoryId =
  | 'unified'
  | 'compat'
  | 'aux'
  | 'seal'
  | 'siniform'
  | 'other'
  | 'pua'
  | 'none'

export interface PlaneMeta {
  id: number
  abbr: string
  zh: string
  note?: string
}

/** 官方区块（已分类）——模型的最小渲染单元 */
export interface Segment {
  start: number
  end: number
  name: string
  category: CategoryId
}

/** 挂接了人工元信息的汉字相关区块（有 zh 即视为 curated）；
 *  PUA 等仅登记分类的最小条目不算，只参与 categoryOf 分类 */
export interface CuratedBlock extends Segment {
  zh: string
  short: string
  desc: string
  chars?: string
  version?: string
}

export interface PlaneModel {
  meta: PlaneMeta
  /** 平面内官方区块，按码位升序；区块之间的空隙即未分配 */
  segments: readonly Segment[]
  /** 平面内汉字相关区块（含中文详情） */
  curated: readonly CuratedBlock[]
}

/** —— JSON 文件形状（resolveJsonModule 推断的类型过宽，此处声明并以开发期校验兜底） —— */
interface PlanesFile {
  unicodeVersion: string
  planeSize: number
  planeCount: number
  legend: { id: CategoryId; label: string; color: string }[]
  stats: Record<string, string>
  planes: PlaneMeta[]
}
interface BlocksFile {
  unicodeVersion: string
  source: string
  blocks: { start: string; end: string; name: string }[]
}
interface BlockMetaFile {
  blocks: {
    name: string
    category: CategoryId
    zh?: string
    short?: string
    chars?: string
    version?: string
    desc?: string
  }[]
}

const planesCfg = planesFile as unknown as PlanesFile
const blocksCfg = blocksFile as unknown as BlocksFile
const blockMeta = blockMetaFile as unknown as BlockMetaFile

/** —— 全局配置 —— */
export const UNICODE_VERSION = planesCfg.unicodeVersion
export const UNICODE_VERSION_LABEL = UNICODE_VERSION.replace(/\.\d+$/, '')
export const PLANE_SIZE = planesCfg.planeSize
export const PLANES: readonly PlaneMeta[] = planesCfg.planes
export const STATS = planesCfg.stats as {
  totalChars: string
  totalScripts: string
  unifiedTotal: string
  hanTotal: string
  sealChars: string
}

/** 图例（分类 → 展示配置），顺序即 planes.json legend 顺序 */
export const CATEGORY_ORDER: readonly CategoryId[] = planesCfg.legend.map((l) => l.id)
export const CATEGORIES: Readonly<Record<CategoryId, { label: string; color: string }>> =
  Object.fromEntries(planesCfg.legend.map((l) => [l.id, { label: l.label, color: l.color }])) as Record<
    CategoryId,
    { label: string; color: string }
  >

/** —— 组装 —— */
const metaByName = new Map(blockMeta.blocks.map((b) => [b.name, b]))

function toSegment(b: BlocksFile['blocks'][number]): Segment {
  return {
    start: Number.parseInt(b.start, 16),
    end: Number.parseInt(b.end, 16),
    name: b.name,
    category: metaByName.get(b.name)?.category ?? 'other',
  }
}

function toCurated(seg: Segment): CuratedBlock | null {
  const m = metaByName.get(seg.name)
  if (!m?.zh) return null
  return {
    ...seg,
    zh: m.zh,
    short: m.short ?? m.zh,
    desc: m.desc ?? '',
    ...(m.chars ? { chars: m.chars } : {}),
    ...(m.version ? { version: m.version } : {}),
  }
}

/** 全量区块（跨平面升序），segmentAt 的二分底座 */
const allSegments: readonly Segment[] = blocksCfg.blocks.map(toSegment)
/** 全量汉字相关区块（升序） */
const curatedAll: readonly CuratedBlock[] = allSegments
  .map(toCurated)
  .filter((b): b is CuratedBlock => b !== null)

const planeModels: readonly PlaneModel[] = PLANES.map((meta) => {
  const base = meta.id * PLANE_SIZE
  const segments = allSegments.filter((s) => s.start >= base && s.end < base + PLANE_SIZE)
  return { meta, segments, curated: segments.map(toCurated).filter((b): b is CuratedBlock => b !== null) }
})

export function getPlane(id: number): PlaneModel {
  const pm = planeModels[id]
  if (!pm) throw new Error(`unknown plane ${id}`)
  return pm
}

/** 码位 → 覆盖它的官方区块（二分查找），空隙返回 null */
export function segmentAt(cp: number): Segment | null {
  let lo = 0
  let hi = allSegments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = allSegments[mid]
    if (cp < s.start) hi = mid - 1
    else if (cp > s.end) lo = mid + 1
    else return s
  }
  return null
}

/** 码位 → 覆盖它的汉字相关区块（含详情），否则 null */
export function curatedAt(cp: number): CuratedBlock | null {
  let lo = 0
  let hi = curatedAll.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const b = curatedAll[mid]
    if (cp < b.start) hi = mid - 1
    else if (cp > b.end) lo = mid + 1
    else return b
  }
  return null
}

/** 空隙（未分配码位）的分类：15/16 号平面整体属 PUA，空隙按定义是“未登记 PUA”。
 *  现行数据中 PUA-A/B 区块（F0000..FFFFF / 100000..10FFFF）已整平面覆盖、无空隙，
 *  此规则仅作语义兜底，与 tooltip 的“未登记”文案口径保持一致 */
export function unassignedCategory(planeId: number): CategoryId {
  return planeId >= 15 ? 'pua' : 'none'
}

/** —— 共享几何：两视图是同一投影的两个尺度 —— */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 平面内相对码位范围（start/end 需先减去平面基址）→ 方形网格上的 1~3 段归一化矩形
 *  （跨行区块呈 C/L 形）。
 *  全景缩略图：cols=256, unit=1（1 像素 = 1 码位）；
 *  区块详图：cols=16, unit=0x100（每格 256 码位，格内坐标为小数） */
export function rectsForRange(start: number, end: number, cols: number, unit: number): Rect[] {
  const c0 = start / unit // 起始格（小数）
  const c1 = (end + 1) / unit // 结束格（开区间，按码位数折算）
  const r0 = Math.floor(c0 / cols)
  const r1 = Math.ceil(c1 / cols)
  const x1 = (c0 - r0 * cols) / cols // 首行内起点（0..1）
  const x2 = Math.min(1, (c1 - (r1 - 1) * cols) / cols) // 末行内终点
  if (r0 === r1 - 1) return [{ x: x1, y: r0 / cols, w: x2 - x1, h: 1 / cols }]
  const rects: Rect[] = [{ x: x1, y: r0 / cols, w: 1 - x1, h: 1 / cols }]
  if (r1 - r0 > 2) rects.push({ x: 0, y: (r0 + 1) / cols, w: 1, h: (r1 - r0 - 2) / cols })
  rects.push({ x: 0, y: (r1 - 1) / cols, w: x2, h: 1 / cols })
  return rects
}

/** 归一化坐标（0..1）→ 码位。span = 每行码位数（全景 0x100，详图 0x1000） */
export function cpAtNorm(base: number, x: number, y: number, span: number): number {
  const rows = PLANE_SIZE / span
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y * rows)))
  const col = Math.min(span - 1, Math.max(0, Math.floor(x * span)))
  return base + row * span + col
}

/** 数值 → U+XXXX 大写十六进制 */
export const hex = (cp: number) => 'U+' + cp.toString(16).toUpperCase()

/** —— 开发期数据校验（生产构建不执行） —— */
function validateModel(): void {
  const errs: string[] = []
  const catIds = new Set(planesCfg.legend.map((l) => l.id))
  if (PLANES.length !== planesCfg.planeCount) errs.push(`planeCount=${planesCfg.planeCount} 与 planes 长度 ${PLANES.length} 不符`)
  PLANES.forEach((p, i) => {
    if (p.id !== i) errs.push(`planes[${i}].id 应为 ${i}，实际 ${p.id}`)
  })
  if ((PLANE_SIZE & (PLANE_SIZE - 1)) !== 0) errs.push(`planeSize=${PLANE_SIZE} 不是 2 的幂`)
  for (let i = 0; i < allSegments.length; i++) {
    const s = allSegments[i]
    if (s.end < s.start) errs.push(`区块起止倒置: ${s.name}`)
    if (!catIds.has(s.category)) errs.push(`未登记的分类 "${s.category}": ${s.name}`)
    if (Math.floor(s.start / PLANE_SIZE) !== Math.floor(s.end / PLANE_SIZE)) errs.push(`区块跨平面: ${s.name}`)
    if (i > 0 && s.start <= allSegments[i - 1].end)
      errs.push(`区块乱序或重叠: ${allSegments[i - 1].name} / ${s.name}`)
  }
  const officialNames = new Set(blocksCfg.blocks.map((b) => b.name))
  for (const m of blockMeta.blocks) {
    if (!officialNames.has(m.name)) errs.push(`block-meta 的 "${m.name}" 在 blocks.json 中不存在`)
    if (m.zh && !m.short) errs.push(`curated 区块缺 short: ${m.name}`)
  }
  if (errs.length > 0) throw new Error(`数据模型校验失败（${errs.length} 处）:\n${errs.join('\n')}`)
}

if (import.meta.env.DEV) validateModel()
