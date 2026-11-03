// 浏览器端覆盖度计算：字体字符集 + hanTable 参考表 → CoverageReportFile
// （与 CLI 输出同构的 JSON 数据模型，可导出/复载）。
// 算法与 CLI 一致：遍历区块已分配区间，交替切分覆盖/缺失运行段；
// 分母 = 实际已分配码位
import { MAIN_BLOCKS, SCATTERED_BLOCKS, HAN_UNICODE_VERSION, HAN_SOURCE, type HanBlock } from './hanTable'
import type { CoverageReportFile, ReportBlock } from './report'

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

export interface FontMemberInfo {
  family: string | null
  subfamily: string | null
  postscriptName: string | null
  format: string
  fontNumber: number | null
}

const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0')
const toHexRanges = (rs: [number, number][]) => rs.map(([s, e]) => [hex(s), hex(e)] as [string, string])

/** 单区块 → 报告区块条目（JSON 形状，hex 区间） */
function blockOf(b: HanBlock, charset: Set<number>): ReportBlock {
  const { covered, coveredRanges, missingRanges } = scan(b.ranges, charset)
  return {
    name: b.name,
    zh: b.zh,
    category: b.category,
    start: hex(b.start),
    end: hex(b.end),
    assigned: b.assigned,
    covered,
    coverage: +(covered / b.assigned).toFixed(6),
    missingCount: b.assigned - covered,
    mappedUnassigned: 0, // 浏览器端不做未分配码位映射检测（CLI 的诊断项）
    coveredRanges: toHexRanges(coveredRanges),
    missingRanges: toHexRanges(missingRanges),
  }
}

/** 由一个字体的字符集实时计算覆盖度报告（JSON 数据模型，与 CLI 输出同构） */
export function computeReport(charset: Set<number>, info: FontMemberInfo): CoverageReportFile {
  const blocks = MAIN_BLOCKS.map((b) => blockOf(b, charset))
  const scatteredBlocks = SCATTERED_BLOCKS.map((b) => blockOf(b, charset))

  const sumOf = (list: ReportBlock[]) => {
    const assigned = list.reduce((n, b) => n + b.assigned, 0)
    const covered = list.reduce((n, b) => n + b.covered, 0)
    return { covered, assigned, coverage: +(covered / assigned).toFixed(6) }
  }
  const unified = sumOf(blocks.filter((b) => b.category === 'unified'))
  const compat = sumOf(blocks.filter((b) => b.category === 'compat'))
  const scattered = sumOf(scatteredBlocks)

  return {
    tool: 'weimo-hanzi font-coverage (browser)',
    generatedAt: new Date().toISOString(),
    font: {
      path: null,
      format: info.format,
      fontNumber: info.fontNumber,
      family: info.family,
      subfamily: info.subfamily,
      postscriptName: info.postscriptName,
      charSetSize: charset.size,
    },
    reference: { unicodeVersion: HAN_UNICODE_VERSION, source: HAN_SOURCE, script: 'Han' },
    summary: {
      total: { covered: unified.covered + compat.covered, assigned: unified.assigned + compat.assigned, coverage: +((unified.covered + compat.covered) / (unified.assigned + compat.assigned)).toFixed(6) },
      unified,
      compat,
      scattered,
    },
    blocks,
    scatteredBlocks,
  }
}
