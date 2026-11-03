// 汉字区块参考表（数据模型层）：src/data/han-assigned.json（官方 Scripts.txt
// 生成的已分配码位真值）挂接 block-meta.json 的分类/中文短名与 blocks.json
// 的官方起止。CLI（scripts/font-coverage.mjs）与浏览器端共用同一份 JSON ——
// 单一数据源，两侧口径必然一致
import hanAssignedFile from '../../data/han-assigned.json'
import blocksFile from '../../data/blocks.json'
import metaFile from '../../data/block-meta.json'

export interface HanBlock {
  /** 官方区块名（blocks.json / 报告 JSON 的同名键） */
  name: string
  /** 中文短名（block-meta 挂接，无则回退官方名） */
  zh: string
  /** 分类：unified/compat = 13 区块主口径；其余为散居 Han */
  category: string
  /** 官方区块起止（数值码位） */
  start: number
  end: number
  assigned: number
  /** 已分配码位数值闭区间（升序） */
  ranges: [number, number][]
}

interface HanAssignedFile {
  unicodeVersion: string
  source: string
  blocks: { name: string; assigned: number; ranges: [string, string][] }[]
}

const hanAssigned = hanAssignedFile as unknown as HanAssignedFile
const metaByName = new Map(metaFile.blocks.map((b) => [b.name, b]))
const rangeByName = new Map(
  (blocksFile.blocks as { start: string; end: string; name: string }[]).map((b) => [
    b.name,
    { start: parseInt(b.start, 16), end: parseInt(b.end, 16) },
  ]),
)

export const HAN_UNICODE_VERSION = hanAssigned.unicodeVersion
export const HAN_SOURCE = hanAssigned.source ?? ''

export const HAN_BLOCKS: readonly HanBlock[] = hanAssigned.blocks.map((b) => {
  const meta = metaByName.get(b.name)
  const range = rangeByName.get(b.name)
  return {
    name: b.name,
    zh: meta?.short ?? meta?.zh ?? b.name,
    category: meta?.category ?? 'other',
    start: range?.start ?? parseInt(b.ranges[0]?.[0] ?? '0', 16),
    end: range?.end ?? parseInt(b.ranges.at(-1)?.[1] ?? '0', 16),
    assigned: b.assigned,
    ranges: b.ranges.map(([s, e]) => [parseInt(s, 16), parseInt(e, 16)]),
  }
})

/** 主口径 = 13 个表意区块（unified + compat），散居（部首/符号）单独小计 */
export const MAIN_BLOCKS = HAN_BLOCKS.filter((b) => b.category === 'unified' || b.category === 'compat')
export const SCATTERED_BLOCKS = HAN_BLOCKS.filter((b) => b.category !== 'unified' && b.category !== 'compat')

const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0')

/** —— 开发期数据校验（生产构建不执行，与 src/lib/model.ts 同款约定） —— */
function validateHanTable(): void {
  const errs: string[] = []
  if (MAIN_BLOCKS.length !== 13) errs.push(`主口径区块数 ${MAIN_BLOCKS.length} ≠ 13`)
  if (blocksFile.unicodeVersion !== hanAssigned.unicodeVersion) {
    errs.push(`版本不一致：blocks.json=${blocksFile.unicodeVersion}，han-assigned=${hanAssigned.unicodeVersion}`)
  }
  for (const b of HAN_BLOCKS) {
    if (b.ranges.some(([s, e], i) => e < s || (i > 0 && s <= b.ranges[i - 1][1]))) {
      errs.push(`区间乱序或倒置: ${b.name}`)
    }
    const span = b.ranges.reduce((n, [s, e]) => n + e - s + 1, 0)
    if (span !== b.assigned) errs.push(`assigned(${b.assigned}) 与区间总量(${span})不符: ${b.name}`)
    const first = b.ranges[0]
    const last = b.ranges.at(-1)
    if (!first || !last || b.start > first[0] || b.end < last[1]) errs.push(`已分配区间超出官方区块: ${b.name} ${hex(b.start)}`)
  }
  if (errs.length > 0) throw new Error(`hanTable 数据校验失败（${errs.length} 处）:\n${errs.join('\n')}`)
}

if (import.meta.env.DEV) validateHanTable()
