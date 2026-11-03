// 预设字符集（数据模型层，P2）：src/data/charsets.json 为单一数据源
// （通规 8105 / 通规一级 3500 / GB2312 6763，生成见 scripts/gen-charsets.mjs）。
// 本文件负责装载为数值码位集合，并提供「字表 × 覆盖视图」的口径统计：
// 字表字符均为已分配 Han 码位，覆盖判定与主口径一致（在并集缺失中即缺）
import charsetsFile from '../../data/charsets.json'
import type { CoverageModel } from './coverage'

export interface CharsetSet {
  id: string
  label: string
  meta: string
  source: string
  /** 升序码位列表（字表顺序，含扩展区代理对字符） */
  cps: number[]
}

interface RawSet {
  id: string
  label: string
  meta: string
  source: string
  chars?: string
  from?: string
  first?: number
}

const raw = charsetsFile as unknown as { generatedAt: string; sets: RawSet[] }

function loadSet(set: RawSet, byId: Map<string, RawSet>): number[] {
  if (set.chars) return [...set.chars].map((c) => c.codePointAt(0) as number)
  if (set.from && set.first) {
    const parent = byId.get(set.from)
    if (!parent?.chars) throw new Error(`字表 ${set.id} 的从属源 ${set.from} 缺少 chars`)
    return [...parent.chars].slice(0, set.first).map((c) => c.codePointAt(0) as number)
  }
  throw new Error(`字表 ${set.id} 既无 chars 也无从属定义`)
}

const byId = new Map(raw.sets.map((s) => [s.id, s]))

export const CHARSETS_GENERATED_AT = raw.generatedAt
export const CHARSETS: readonly CharsetSet[] = raw.sets.map((s) => ({
  id: s.id,
  label: s.label,
  meta: s.meta,
  source: s.source,
  cps: loadSet(s, byId),
}))

/** —— 开发期数据校验（生产构建不执行，与 hanTable 同款约定） —— */
if (import.meta.env.DEV) {
  const expect: Record<string, number> = { tonggui: 8105, 'tonggui-1': 3500, gb2312: 6763 }
  for (const s of CHARSETS) {
    if (expect[s.id] !== undefined && s.cps.length !== expect[s.id]) {
      throw new Error(`字表 ${s.id} 字数 ${s.cps.length} ≠ ${expect[s.id]}`)
    }
    if (new Set(s.cps).size !== s.cps.length) throw new Error(`字表 ${s.id} 存在重复字`)
  }
}

export interface CharsetCov {
  total: number
  covered: number
  coverage: number
  /** 缺失字符（字表顺序；展示用） */
  missingChars: string[]
  /** 缺失码位升序区间（导出/救援用） */
  missingRanges: [number, number][]
}

/** 覆盖视图的全局缺失区间（升序合并；missingByPlane 分桶还原） */
function globalMissing(model: CoverageModel): [number, number][] {
  const list = [...model.missingByPlane.values()].flat().sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [s, e] of list) {
    const last = out.at(-1)
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** 字表 × 覆盖视图 → 覆盖/缺失统计（纯函数，View 直接渲染） */
export function charsetCoverage(set: CharsetSet, model: CoverageModel): CharsetCov {
  const missing = globalMissing(model)
  let mi = 0
  let covered = 0
  const missingChars: string[] = []
  const missingRanges: [number, number][] = []
  // cps 为字表顺序（非升序），缺失区间的双指针走查必须用升序副本，
  // 否则指针只前进会漏判「高频字先高后低」的折返
  const cps = [...set.cps].sort((a, b) => a - b)
  for (const cp of cps) {
    while (mi < missing.length && missing[mi][1] < cp) mi++
    const m = missing[mi]
    if (m && cp >= m[0] && cp <= m[1]) {
      missingChars.push(String.fromCodePoint(cp))
      const last = missingRanges.at(-1)
      if (last && last[1] === cp - 1) last[1] = cp
      else missingRanges.push([cp, cp])
    } else covered++
  }
  const total = set.cps.length
  return { total, covered, coverage: total === 0 ? 0 : +(covered / total).toFixed(6), missingChars, missingRanges }
}
