// 汉字区块参考表：src/data/han-assigned.json（官方 Scripts.txt 生成的已分配码位真值）
// 挂接 block-meta.json 的分类（unified/compat/散居）与中文短名，供浏览器端实时计算覆盖度。
// 与 CLI（scripts/font-coverage.mjs）共用同一份 JSON —— 单一数据源，两侧口径必然一致
import hanAssignedFile from '../../data/han-assigned.json'
import metaFile from '../../data/block-meta.json'

export interface HanBlock {
  /** 官方区块名（blocks.json / 报告 JSON 的同名键） */
  name: string
  /** 中文短名（block-meta 挂接，无则回退官方名） */
  zh: string
  /** 分类：unified/compat = 13 区块主口径；其余为散居 Han */
  category: string
  assigned: number
  /** 已分配码位数值闭区间（升序） */
  ranges: [number, number][]
}

interface HanAssignedFile {
  unicodeVersion: string
  blocks: { name: string; assigned: number; ranges: [string, string][] }[]
}

const hanAssigned = hanAssignedFile as unknown as HanAssignedFile
const metaByName = new Map(metaFile.blocks.map((b) => [b.name, b]))

export const HAN_UNICODE_VERSION = hanAssigned.unicodeVersion

export const HAN_BLOCKS: readonly HanBlock[] = hanAssigned.blocks.map((b) => {
  const meta = metaByName.get(b.name)
  return {
    name: b.name,
    zh: meta?.short ?? meta?.zh ?? b.name,
    category: meta?.category ?? 'other',
    assigned: b.assigned,
    ranges: b.ranges.map(([s, e]) => [parseInt(s, 16), parseInt(e, 16)]),
  }
})

/** 主口径 = 13 个表意区块（unified + compat），散居（部首/符号）单独小计 */
export const MAIN_BLOCKS = HAN_BLOCKS.filter((b) => b.category === 'unified' || b.category === 'compat')
export const SCATTERED_BLOCKS = HAN_BLOCKS.filter((b) => b.category !== 'unified' && b.category !== 'compat')
