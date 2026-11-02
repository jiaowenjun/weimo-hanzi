// 覆盖度报告解析：scripts/font-coverage.mjs 输出的 JSON → 演示页运行时模型
// 运行时用户输入与 model.ts 的静态数据模型分离，此处只做解析/校验/分桶，不含渲染
import { PLANE_SIZE } from '../../lib/model'

/** 报告中的区块条目（missingRanges 已解析为数值闭区间） */
interface ReportBlock {
  name: string
  assigned: number
  covered: number
  coverage: number
  missingCount: number
  missingRanges: [number, number][]
}

/** 悬停卡片查表用的区块覆盖摘要 */
export interface BlockCov {
  covered: number
  assigned: number
  coverage: number
  missingCount: number
}

export interface Subtotal {
  covered: number
  assigned: number
  coverage: number
}

export interface CoverageModel {
  /** 字体展示名：family subfamily（回退 postscriptName / 未知字体） */
  label: string
  /** 副标签：postscriptName · 格式 · cmap 条目数 */
  sublabel: string
  /** 四档小计：13 区块合计 / 统一表意 / 兼容表意 / 散居 Han */
  summary: { total: Subtotal; unified: Subtotal; compat: Subtotal; scattered: Subtotal }
  /** 官方区块名 → 覆盖摘要（含散居区块，供悬停卡片按 curated.name 查表） */
  blocksByName: Map<string, BlockCov>
  /** 平面号 → 缺失码位闭区间（blocks + scatteredBlocks 合并，可直接驱动暗罩绘制） */
  missingByPlane: Map<number, [number, number][]>
}

export type ParseResult = CoverageModel | { error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const hexOf = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^[0-9a-fA-F]{1,6}$/.test(v)) return null
  const n = Number.parseInt(v, 16)
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? n : null
}

const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** 解析一个区块条目；损坏时返回 null（容错：未知区块名仍可绘制，只是无悬停元信息） */
function parseBlock(v: unknown): ReportBlock | null {
  if (!isObj(v) || typeof v.name !== 'string' || !Array.isArray(v.missingRanges)) return null
  const assigned = numOf(v.assigned)
  const covered = numOf(v.covered)
  const coverage = numOf(v.coverage)
  const missingCount = numOf(v.missingCount)
  if (assigned === null || covered === null || coverage === null || missingCount === null) return null
  const missingRanges: [number, number][] = []
  for (const pair of v.missingRanges) {
    if (!Array.isArray(pair) || pair.length !== 2) return null
    const lo = hexOf(pair[0])
    const hi = hexOf(pair[1])
    if (lo === null || hi === null || lo > hi) return null
    missingRanges.push([lo, hi])
  }
  return { name: v.name, assigned, covered, coverage, missingCount, missingRanges }
}

export function parseCoverageReport(json: unknown): ParseResult {
  if (!isObj(json) || !Array.isArray(json.blocks) || json.blocks.length === 0) {
    return { error: '这不是 font-coverage 报告：缺少 blocks 数组（请载入 pnpm coverage 生成的 .coverage.json）' }
  }
  const all = [...(json.blocks as unknown[]), ...(Array.isArray(json.scatteredBlocks) ? (json.scatteredBlocks as unknown[]) : [])]
  const parsed = all.map(parseBlock)
  if (parsed.some((b) => b === null)) {
    return { error: '报告数据损坏：blocks/missingRanges 形状不符合预期' }
  }

  const font = isObj(json.font) ? json.font : {}
  const family = typeof font.family === 'string' ? font.family : null
  const subfamily = typeof font.subfamily === 'string' ? font.subfamily : null
  const psName = typeof font.postscriptName === 'string' ? font.postscriptName : null
  const format = typeof font.format === 'string' ? font.format : null
  const charSetSize = numOf(font.charSetSize)
  const label = [family, subfamily].filter(Boolean).join(' ') || psName || '未知字体'
  const subParts = [psName, format, charSetSize !== null ? `cmap ${charSetSize.toLocaleString()} 条` : null].filter(Boolean)
  const sublabel = subParts.join(' · ')

  const subOf = (key: string): Subtotal => {
    const s = isObj(json.summary) && isObj(json.summary[key]) ? json.summary[key] : {}
    return {
      covered: numOf(s.covered) ?? 0,
      assigned: numOf(s.assigned) ?? 0,
      coverage: numOf(s.coverage) ?? 0,
    }
  }

  const blocksByName = new Map<string, BlockCov>()
  const missingByPlane = new Map<number, [number, number][]>()
  for (const b of parsed as ReportBlock[]) {
    blocksByName.set(b.name, {
      covered: b.covered,
      assigned: b.assigned,
      coverage: b.coverage,
      missingCount: b.missingCount,
    })
    for (const [lo, hi] of b.missingRanges) {
      // 理论上汉字区间不跨平面，仍按平面边界切开以保证稳健
      let s = lo
      while (s <= hi) {
        const plane = Math.floor(s / PLANE_SIZE)
        const end = Math.min(hi, (plane + 1) * PLANE_SIZE - 1)
        const list = missingByPlane.get(plane) ?? []
        const prev = list[list.length - 1]
        if (prev && prev[1] === s - 1) prev[1] = end // 相邻区间合并
        else list.push([s, end])
        missingByPlane.set(plane, list)
        s = end + 1
      }
    }
  }

  return {
    label,
    sublabel,
    summary: {
      total: subOf('total'),
      unified: subOf('unified'),
      compat: subOf('compat'),
      scattered: subOf('scattered'),
    },
    blocksByName,
    missingByPlane,
  }
}

/** 悬停卡片 meta 行：覆盖率摘要（无数据时返回空数组） */
export function covMeta(name: string, cov: CoverageModel | null): { k: string; v: string }[] {
  const b = cov?.blocksByName.get(name)
  if (!b || !cov) return []
  return [
    {
      k: '字体覆盖',
      v: `${b.covered.toLocaleString()} / ${b.assigned.toLocaleString()}（${(b.coverage * 100).toFixed(1)}%）`,
    },
    { k: '缺失', v: `${b.missingCount.toLocaleString()} 字` },
  ]
}
