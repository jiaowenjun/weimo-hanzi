// 覆盖度数据模型（JSON 形状）：与 CLI（scripts/font-coverage.mjs）输出的
// .coverage.json 完全同构，是演示页的唯一数据载体 ——
// 浏览器实时计算（compute.ts）、报告文件载入、多字体并集（union.ts）、导出
// 全部以本形状流转；View 一律经 coverage.ts 组装层消费，不直接触碰本文件细节
export interface ReportBlock {
  name: string
  zh: string
  category: string
  /** 区块官方起止（hex4） */
  start: string
  end: string
  assigned: number
  covered: number
  coverage: number
  missingCount: number
  mappedUnassigned: number
  /** 覆盖/缺失码位区间（hex4 闭区间对，区块内升序） */
  coveredRanges: [string, string][]
  missingRanges: [string, string][]
}

export interface ReportSummary {
  covered: number
  assigned: number
  coverage: number
}

export interface CoverageReportFile {
  tool: string
  generatedAt: string
  font: {
    path: string | null
    format: string
    fontNumber: number | null
    family: string | null
    subfamily: string | null
    postscriptName: string | null
    charSetSize: number
  }
  reference: { unicodeVersion: string; source: string; script: string }
  /** 四档小计（展示性冗余；组装层以 blocks 重算为准） */
  summary: { total: ReportSummary; unified: ReportSummary; compat: ReportSummary; scattered: ReportSummary }
  blocks: ReportBlock[]
  scatteredBlocks: ReportBlock[]
  strict?: unknown
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const hexOf = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^[0-9a-fA-F]{1,6}$/.test(v)) return null
  const n = Number.parseInt(v, 16)
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? n : null
}

const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const strOf = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/** 宽松校验一个报告 JSON：区块必需字段与 hex 区间对合法即可，
 *  zh/category 等展示字段允许缺失（组装层会按 hanTable 挂接） */
export function validateReportFile(json: unknown): { report: CoverageReportFile } | { error: string } {
  if (!isObj(json) || !Array.isArray(json.blocks) || json.blocks.length === 0) {
    return { error: '这不是 font-coverage 报告：缺少 blocks 数组（应为 .coverage.json 或字体文件）' }
  }
  const scatteredRaw = Array.isArray(json.scatteredBlocks) ? json.scatteredBlocks : []

  const parseBlock = (v: unknown): ReportBlock | { error: string } => {
    if (!isObj(v) || typeof v.name !== 'string' || !Array.isArray(v.missingRanges)) {
      return { error: '报告数据损坏：区块条目形状不符' }
    }
    const assigned = numOf(v.assigned)
    const covered = numOf(v.covered)
    const coverage = numOf(v.coverage)
    const missingCount = numOf(v.missingCount)
    if (assigned === null || covered === null || coverage === null || missingCount === null) {
      return { error: `报告数据损坏：区块 ${String(v.name)} 数值字段缺失` }
    }
    const ranges = (pairs: unknown): [string, string][] | null => {
      if (!Array.isArray(pairs)) return []
      const out: [string, string][] = []
      for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2) return null
        const lo = hexOf(pair[0])
        const hi = hexOf(pair[1])
        if (lo === null || hi === null || lo > hi) return null
        out.push([String(pair[0]), String(pair[1])])
      }
      return out
    }
    const missingRanges = ranges(v.missingRanges)
    if (missingRanges === null) return { error: `报告数据损坏：区块 ${v.name} 的 missingRanges 非法` }
    const coveredRanges = ranges(v.coveredRanges) ?? []
    return {
      name: v.name,
      zh: strOf(v.zh, v.name),
      category: strOf(v.category, 'other'),
      start: strOf(v.start, '0000'),
      end: strOf(v.end, '0000'),
      assigned,
      covered,
      coverage,
      missingCount,
      mappedUnassigned: numOf(v.mappedUnassigned) ?? 0,
      coveredRanges,
      missingRanges,
    }
  }

  const blocks: ReportBlock[] = []
  for (const v of json.blocks) {
    const b = parseBlock(v)
    if ('error' in b) return { error: b.error }
    blocks.push(b)
  }
  const scatteredBlocks: ReportBlock[] = []
  for (const v of scatteredRaw) {
    const b = parseBlock(v)
    if ('error' in b) return { error: b.error }
    scatteredBlocks.push(b)
  }

  const font = isObj(json.font) ? json.font : {}
  const ref = isObj(json.reference) ? json.reference : {}
  const sum = isObj(json.summary) ? json.summary : {}
  const sub = (k: string): ReportSummary => {
    const s = isObj(sum[k]) ? sum[k] : {}
    return { covered: numOf(s.covered) ?? 0, assigned: numOf(s.assigned) ?? 0, coverage: numOf(s.coverage) ?? 0 }
  }
  return {
    report: {
      tool: strOf(json.tool, 'weimo-hanzi font-coverage'),
      generatedAt: strOf(json.generatedAt, new Date().toISOString()),
      font: {
        path: typeof font.path === 'string' ? font.path : null,
        format: strOf(font.format, 'unknown'),
        fontNumber: numOf(font.fontNumber) ?? null,
        family: typeof font.family === 'string' ? font.family : null,
        subfamily: typeof font.subfamily === 'string' ? font.subfamily : null,
        postscriptName: typeof font.postscriptName === 'string' ? font.postscriptName : null,
        charSetSize: numOf(font.charSetSize) ?? 0,
      },
      reference: {
        unicodeVersion: strOf(ref.unicodeVersion, ''),
        source: strOf(ref.source, ''),
        script: strOf(ref.script, 'Han'),
      },
      summary: {
        total: sub('total'),
        unified: sub('unified'),
        compat: sub('compat'),
        scattered: sub('scattered'),
      },
      blocks,
      scatteredBlocks,
    },
  }
}
