// 并集边际贡献（数据模型层派生，不进报告 JSON）：
// 字体栈按队列顺序逐款并入，第 i 款「新增覆盖」= 并入前缺失 − 并入后缺失
// （逐块对缺失区间求交，与 union.ts 同口径）。逐区块给出增量，View 据此在
// 队列行/悬停卡展示每款字体补了多少缺字；首款的新增即其自身覆盖数
import { HAN_BLOCKS } from './hanTable'
import { intersectRanges } from './union'
import type { CoverageReportFile } from './report'

export interface MarginalEntry {
  /** 全部 Han 区块合计新增 */
  total: number
  /** 区块名 → 该区块新增（仅收录 > 0 的区块） */
  byBlock: Map<string, number>
}

const hexOf = (v: string): number => Number.parseInt(v, 16)
const countOf = (list: [number, number][]): number => list.reduce((n, [s, e]) => n + e - s + 1, 0)

/** 每款字体按队列顺序的边际新增覆盖（与队列下标一一对应） */
export function marginalContributions(reports: CoverageReportFile[]): MarginalEntry[] {
  const out: MarginalEntry[] = reports.map(() => ({ total: 0, byBlock: new Map<string, number>() }))
  for (const hb of HAN_BLOCKS) {
    let inter: [number, number][] | null = null
    for (let i = 0; i < reports.length; i++) {
      const blk = [...reports[i].blocks, ...reports[i].scatteredBlocks].find((b) => b.name === hb.name)
      const miss = blk?.missingRanges.map(([s, e]) => [hexOf(s), hexOf(e)] as [number, number])
      if (!miss) break // 该字体缺此块数据（不应发生）：本块不再计入
      const prev = inter === null ? null : countOf(inter)
      inter = inter === null ? miss : intersectRanges(inter, miss)
      const add = prev === null ? hb.assigned - countOf(inter) : prev - countOf(inter)
      if (add > 0) {
        out[i].total += add
        out[i].byBlock.set(hb.name, add)
      }
      if (inter.length === 0) break
    }
  }
  return out
}
