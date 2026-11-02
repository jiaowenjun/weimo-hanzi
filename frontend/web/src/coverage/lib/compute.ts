// 浏览器端覆盖度实时计算：fontkit 字体对象 + hanTable 参考表 → CoverageModel
// 算法与 CLI（scripts/font-coverage.mjs）一致：遍历区块已分配区间，
// 交替切分覆盖/缺失运行段；分母 = 实际已分配码位
import { PLANE_SIZE } from '../../lib/model'
import { MAIN_BLOCKS, SCATTERED_BLOCKS, type HanBlock } from './hanTable'
import type { CoverageModel, Subtotal, BlockCov } from './coverage'

/** 在一组闭区间上统计 charset 命中，并交替切分出覆盖/缺失数值区间 */
function scan(ranges: [number, number][], charset: Set<number>) {
  const coveredRanges: [number, number][] = []
  const missingRanges: [number, number][] = []
  let covered = 0
  for (const [s, e] of ranges) {
    let runStart: number | null = null
    let runCovered = false
    for (let cp = s; cp <= e; cp++) {
      const hit = charset.has(cp)
      if (runStart === null || hit !== runCovered) {
        if (runStart !== null) (runCovered ? coveredRanges : missingRanges).push([runStart, cp - 1])
        runStart = cp
        runCovered = hit
      }
      if (hit) covered++
    }
    if (runStart !== null) (runCovered ? coveredRanges : missingRanges).push([runStart, e])
  }
  return { covered, coveredRanges, missingRanges }
}

function subtotal(list: { assigned: number; covered: number }[]): Subtotal {
  const assigned = list.reduce((n, b) => n + b.assigned, 0)
  const covered = list.reduce((n, b) => n + b.covered, 0)
  return { covered, assigned, coverage: assigned === 0 ? 0 : +(covered / assigned).toFixed(6) }
}

/** 缺失区间按平面分桶并合并相邻段（跨平面切开仅作稳健性兜底） */
function bucketByPlane(missing: [number, number][]): Map<number, [number, number][]> {
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

/** 单个区块的覆盖计算结果 */
interface BlockResult {
  name: string
  category: string
  assigned: number
  covered: number
  missingRanges: [number, number][]
}

function analyzeBlock(b: HanBlock, charset: Set<number>): BlockResult {
  const { covered, missingRanges } = scan(b.ranges, charset)
  return { name: b.name, category: b.category, assigned: b.assigned, covered, missingRanges }
}

export interface FontMemberInfo {
  /** 展示名（family + subfamily） */
  label: string
  /** 副标签（postscriptName · 格式 · cmap 条目数） */
  sublabel: string
  family: string | null
  subfamily: string | null
  format: string
}

/** 由一个字体的字符集实时计算 CoverageModel（与报告 JSON 解析产出同构） */
export function computeCoverage(charset: Set<number>, info: FontMemberInfo): CoverageModel {
  const mainResults = MAIN_BLOCKS.map((b) => analyzeBlock(b, charset))
  const scatteredResults = SCATTERED_BLOCKS.map((b) => analyzeBlock(b, charset))

  const blocksByName = new Map<string, BlockCov>()
  const allMissing: [number, number][] = []
  for (const r of [...mainResults, ...scatteredResults]) {
    blocksByName.set(r.name, {
      covered: r.covered,
      assigned: r.assigned,
      coverage: r.assigned === 0 ? 0 : +(r.covered / r.assigned).toFixed(6),
      missingCount: r.assigned - r.covered,
    })
    allMissing.push(...r.missingRanges)
  }

  return {
    label: info.label,
    sublabel: info.sublabel,
    summary: {
      total: subtotal(mainResults),
      unified: subtotal(mainResults.filter((r) => r.category === 'unified')),
      compat: subtotal(mainResults.filter((r) => r.category === 'compat')),
      scattered: subtotal(scatteredResults),
    },
    blocksByName,
    missingByPlane: bucketByPlane(allMissing),
  }
}
