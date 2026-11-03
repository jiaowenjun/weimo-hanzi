// 覆盖度 Model 组装层：CoverageReportFile（JSON 数据模型，CLI/浏览器/并集同构）
// → CoverageModel（内存 ViewModel），对码空间全景、区块详图、统计芯片、
// 悬停卡片等 View 提供纯数据接口；View 不触碰报告 JSON 细节。
// 分层约定与 src/lib/model.ts 一致：数据（report.ts/hanTable.ts）→ 组装（本文件）→ View
import { PLANE_SIZE } from '../../lib/model'
import { HAN_BLOCKS } from './hanTable'
import type { CoverageReportFile } from './report'

/** 悬停卡片查表用的区块覆盖摘要（missingRanges 为数值闭区间，供并集求交） */
export interface BlockCov {
  covered: number
  assigned: number
  coverage: number
  missingCount: number
  missingRanges: [number, number][]
}

export interface Subtotal {
  covered: number
  assigned: number
  coverage: number
}

/** 组装出的 ViewModel：两视图（全景/详图）与统计芯片的唯一数据来源 */
export interface CoverageModel {
  /** 字体展示名：family subfamily（回退 postscriptName / 未知字体） */
  label: string
  /** 副标签：postscriptName · 格式 · cmap 条目数 */
  sublabel: string
  /** 四档小计：13 区块合计 / 统一表意 / 兼容表意 / 散居 Han（按区块重算，不信任报告冗余字段） */
  summary: { total: Subtotal; unified: Subtotal; compat: Subtotal; scattered: Subtotal }
  /** 官方区块名 → 覆盖摘要（含散居区块，供悬停卡片按 curated.name 查表） */
  blocksByName: Map<string, BlockCov>
  /** 平面号 → 缺失码位闭区间（blocks + scatteredBlocks 合并，驱动暗罩/斜纹绘制） */
  missingByPlane: Map<number, [number, number][]>
}

/** 字体栈条目（悬停卡片逐字体行）；add* = 按队列顺序的边际新增（派生，可选） */
export interface StackEntry {
  label: string
  blocksByName: Map<string, BlockCov>
  /** 合计新增（队列行徽标用） */
  addTotal?: number
  /** 区块名 → 新增（悬停卡逐字体行用） */
  addByBlock?: Map<string, number>
}

/** 统计芯片数据（View 仅渲染，不组文案） */
export interface StatChip {
  value: string
  /** 次要数字（如 “/ 102,999”） */
  of?: string
  label: string
}

export function subtotalOf(list: { assigned: number; covered: number }[]): Subtotal {
  const assigned = list.reduce((n, b) => n + b.assigned, 0)
  const covered = list.reduce((n, b) => n + b.covered, 0)
  return { covered, assigned, coverage: assigned === 0 ? 0 : +(covered / assigned).toFixed(6) }
}

/** 缺失区间按平面分桶并合并相邻段（跨平面切开仅作稳健性兜底） */
export function bucketByPlane(missing: [number, number][]): Map<number, [number, number][]> {
  const byPlane = new Map<number, [number, number][]>()
  for (const [lo, hi] of missing) {
    let s = lo
    while (s <= hi) {
      const plane = Math.floor(s / PLANE_SIZE)
      const end = Math.min(hi, (plane + 1) * PLANE_SIZE - 1)
      const list = byPlane.get(plane) ?? []
      const prev = list[list.length - 1]
      if (prev && prev[1] === s - 1) prev[1] = end
      else list.push([s, end])
      byPlane.set(plane, list)
      s = end + 1
    }
  }
  return byPlane
}

const hexOf = (v: string): number => Number.parseInt(v, 16)

/** 报告 JSON → ViewModel（唯一组装入口；category/顺序以 hanTable 为单一事实源） */
export function assembleViewModel(report: CoverageReportFile): CoverageModel {
  const blocksByName = new Map<string, BlockCov>()
  const missingByPlane = bucketByPlane(
    [...report.blocks, ...report.scatteredBlocks].flatMap((b) =>
      b.missingRanges.map(([s, e]) => [hexOf(s), hexOf(e)] as [number, number]),
    ),
  )

  const mainVals: { assigned: number; covered: number }[] = []
  const unifiedVals: { assigned: number; covered: number }[] = []
  const compatVals: { assigned: number; covered: number }[] = []
  const scatteredVals: { assigned: number; covered: number }[] = []

  for (const b of [...report.blocks, ...report.scatteredBlocks]) {
    blocksByName.set(b.name, {
      covered: b.covered,
      assigned: b.assigned,
      coverage: b.coverage,
      missingCount: b.missingCount,
      missingRanges: b.missingRanges.map(([s, e]) => [hexOf(s), hexOf(e)]),
    })
  }
  // 小计按 hanTable 分类重算（报告 summary 仅作展示冗余）
  for (const hb of HAN_BLOCKS) {
    const b = blocksByName.get(hb.name)
    if (!b) continue
    if (hb.category === 'unified') {
      unifiedVals.push(b)
      mainVals.push(b)
    } else if (hb.category === 'compat') {
      compatVals.push(b)
      mainVals.push(b)
    } else scatteredVals.push(b)
  }

  const f = report.font
  const label = [f.family, f.subfamily].filter(Boolean).join(' ') || f.postscriptName || '未知字体'
  const subParts = [
    f.postscriptName,
    f.format,
    f.charSetSize > 0 ? `cmap ${f.charSetSize.toLocaleString()} 条` : null,
    f.fontNumber !== null ? `ttc#${f.fontNumber}` : null,
  ].filter(Boolean)

  return {
    label,
    sublabel: subParts.join(' · '),
    summary: {
      total: subtotalOf(mainVals),
      unified: subtotalOf(unifiedVals),
      compat: subtotalOf(compatVals),
      scattered: subtotalOf(scatteredVals),
    },
    blocksByName,
    missingByPlane,
  }
}

/** 统计芯片数据（合计 + 三档小计），View 直接 map 渲染 */
export function statChips(m: CoverageModel | null): StatChip[] {
  if (!m) return []
  const pct = (s: Subtotal) => `${(s.coverage * 100).toFixed(1)}%`
  return [
    {
      value: m.summary.total.covered.toLocaleString(),
      of: `/ ${m.summary.total.assigned.toLocaleString()}`,
      label: `13 区块覆盖 · ${pct(m.summary.total)}`,
    },
    { value: pct(m.summary.unified), label: '统一表意（11 区块）' },
    { value: pct(m.summary.compat), label: '兼容表意（2 区块）' },
    { value: pct(m.summary.scattered), label: '散居 Han（部首/符号）' },
  ]
}

/** 悬停卡片 meta 行：单字体时输出覆盖/缺失两行；
 *  多字体（栈 ≥2）时输出逐字体覆盖率行 + 合计行 */
export function covMeta(
  name: string,
  cov: CoverageModel | null,
  stack: StackEntry[] = [],
  unionCov: CoverageModel | null = null,
): { k: string; v: string }[] {
  if (stack.length >= 2) {
    const lines = stack.flatMap((f) => {
      const b = f.blocksByName.get(name)
      if (!b) return []
      const add = f.addByBlock?.get(name)
      const addTxt = add && add > 0 ? ` · 补 +${add.toLocaleString()}` : ''
      return [
        {
          k: f.label,
          v: `${(b.coverage * 100).toFixed(1)}%${addTxt} · 缺 ${b.missingCount.toLocaleString()}`,
        },
      ]
    })
    const u = unionCov?.blocksByName.get(name)
    if (u) {
      lines.push({
        k: '合计',
        v: `${u.covered.toLocaleString()} / ${u.assigned.toLocaleString()}（${(u.coverage * 100).toFixed(1)}%）`,
      })
    }
    return lines
  }
  const b = cov?.blocksByName.get(name)
  if (!b) return []
  return [
    {
      k: '字体覆盖',
      v: `${b.covered.toLocaleString()} / ${b.assigned.toLocaleString()}（${(b.coverage * 100).toFixed(1)}%）`,
    },
    { k: '缺失', v: `${b.missingCount.toLocaleString()} 字` },
  ]
}
