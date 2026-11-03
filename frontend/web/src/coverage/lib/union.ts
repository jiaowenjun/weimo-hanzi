// 多字体并集（数据模型层）：字体栈语义下总体覆盖 = 各字体 cmap 并集，
// 等价地：总体缺失 = 各字体缺失区间列表的逐块交集。
// 在 CoverageReportFile（JSON 数据模型）层面求并，产出同构的报告 ——
// 可像单字体报告一样组装、渲染、导出
import { HAN_BLOCKS } from './hanTable'
import { subtotalOf } from './coverage'
import type { CoverageReportFile, ReportBlock, ReportSummary } from './report'

/** 两个升序不相交区间列表的交集（双指针） */
function intersectRanges(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0])
    const hi = Math.min(a[i][1], b[j][1])
    if (lo <= hi) out.push([lo, hi])
    if (a[i][1] < b[j][1]) i++
    else j++
  }
  return out
}

const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0')

/** 已分配区间内扣除缺失区间 → 覆盖区间（导出报告保持 coveredRanges 完整） */
function complement(assigned: [number, number][], missing: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const [s, e] of assigned) {
    let cp = s
    for (const [ms, me] of missing) {
      if (me < cp) continue
      if (ms > e) break
      if (ms > cp) out.push([cp, ms - 1])
      cp = Math.max(cp, me + 1)
    }
    if (cp <= e) out.push([cp, e])
  }
  return out
}

const sumOf = (list: ReportBlock[]): ReportSummary => {
  const assigned = list.reduce((n, b) => n + b.assigned, 0)
  const covered = list.reduce((n, b) => n + b.covered, 0)
  return { covered, assigned, coverage: +((assigned && covered / assigned) || 0).toFixed(6) }
}

/** 报告级并集：逐块对缺失区间求交，产出「合计」字体栈报告（同构可导出） */
export function unionReports(reports: CoverageReportFile[]): CoverageReportFile {
  const blocks: ReportBlock[] = []
  const scatteredBlocks: ReportBlock[] = []

  for (const hb of HAN_BLOCKS) {
    // 逐字体对缺失区间求交；任一字体缺该块数据（不应发生）则交集为空
    let inter: [number, number][] | null = null
    for (const r of reports) {
      const blk = [...r.blocks, ...r.scatteredBlocks].find((b) => b.name === hb.name)
      const miss = blk?.missingRanges.map(([s, e]) => [parseInt(s, 16), parseInt(e, 16)] as [number, number])
      if (!miss) {
        inter = []
        break
      }
      inter = inter === null ? miss : intersectRanges(inter, miss)
      if (inter.length === 0) break
    }
    const missing = inter ?? []
    const missingCount = missing.reduce((n, [s, e]) => n + e - s + 1, 0)
    const covered = hb.assigned - missingCount
    const entry: ReportBlock = {
      name: hb.name,
      zh: hb.zh,
      category: hb.category,
      start: hex(hb.start),
      end: hex(hb.end),
      assigned: hb.assigned,
      covered,
      coverage: +((hb.assigned && covered / hb.assigned) || 0).toFixed(6),
      missingCount,
      mappedUnassigned: 0, // 并集层不做未分配码位映射检测
      coveredRanges: complement(hb.ranges, missing).map(([s, e]) => [hex(s), hex(e)]),
      missingRanges: missing.map(([s, e]) => [hex(s), hex(e)]),
    }
    ;(hb.category === 'unified' || hb.category === 'compat' ? blocks : scatteredBlocks).push(entry)
  }

  const unified = sumOf(blocks.filter((b) => b.category === 'unified'))
  const compat = sumOf(blocks.filter((b) => b.category === 'compat'))
  const first = reports[0]
  return {
    tool: 'weimo-hanzi font-coverage (browser union)',
    generatedAt: new Date().toISOString(),
    font: {
      path: null,
      format: `stack(${reports.length})`,
      fontNumber: null,
      family: `合计 · ${reports.length} 款字体并集`,
      subfamily: null,
      postscriptName: reports.map((r) => r.font.postscriptName ?? r.font.family ?? '?').join(' + '),
      charSetSize: 0,
    },
    reference: first?.reference ?? { unicodeVersion: '', source: '', script: 'Han' },
    summary: {
      total: subtotalOf([...blocks.map((b) => ({ assigned: b.assigned, covered: b.covered }))]),
      unified,
      compat,
      scattered: sumOf(scatteredBlocks),
    },
    blocks,
    scatteredBlocks,
  }
}
