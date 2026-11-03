// 文本缺字检测（数据模型层，P2）：文本 × 覆盖视图 → 逐字缺失清单。
// 口径：只检测 Script=Han 的字符（覆盖报告只含 Han 区块）；
// 文本中出现但不在 Scripts.txt 已分配区间的字（未编码/新提案区）单列 ——
// 任何按本工具口径统计的字体都必然缺它们
import { HAN_BLOCKS } from '../../coverage/lib/hanTable'
import type { CoverageModel } from '../../coverage/lib/coverage'

export interface TextCharStat {
  cp: number
  char: string
  /** 在文本中的出现次数 */
  count: number
}

export interface TextCheckResult {
  /** 去空白后文本总字符数 */
  total: number
  /** 去重汉字数（Script=Han） */
  uniqueHan: number
  /** 去重汉字中被覆盖的数量 */
  coveredUnique: number
  /** 缺失字符（按出现次数降序，同频按码位升序） */
  missing: TextCharStat[]
  /** 不在 Scripts.txt 已分配区间的汉字（覆盖口径外，单列） */
  unassigned: TextCharStat[]
}

const HAN_RE = /\p{Script=Han}/u

/** cp 是否为 Scripts.txt 已分配的 Han 码位（hanTable 为单一真值） */
function isHanAssigned(cp: number): boolean {
  return HAN_BLOCKS.some((b) => b.ranges.some(([s, e]) => cp >= s && cp <= e))
}

/** cp 是否落在覆盖视图的缺失区间（missingByPlane 分桶内线性查） */
function isMissing(cp: number, model: CoverageModel): boolean {
  const ranges = model.missingByPlane.get(Math.floor(cp / 0x10000))
  return !!ranges?.some(([s, e]) => cp >= s && cp <= e)
}

/** 文本 × 覆盖视图 → 缺字统计（纯函数） */
export function checkText(text: string, model: CoverageModel): TextCheckResult {
  const counts = new Map<number, number>()
  let total = 0
  for (const ch of text) {
    if (!ch.trim()) continue
    total++
    if (!HAN_RE.test(ch)) continue
    const cp = ch.codePointAt(0) as number
    counts.set(cp, (counts.get(cp) ?? 0) + 1)
  }
  const missing: TextCharStat[] = []
  const unassigned: TextCharStat[] = []
  let coveredUnique = 0
  for (const [cp, count] of counts) {
    const stat = { cp, char: String.fromCodePoint(cp), count }
    if (!isHanAssigned(cp)) {
      unassigned.push(stat)
      continue
    }
    if (isMissing(cp, model)) missing.push(stat)
    else coveredUnique++
  }
  missing.sort((a, b) => b.count - a.count || a.cp - b.cp)
  unassigned.sort((a, b) => b.count - a.count || a.cp - b.cp)
  return { total, uniqueHan: counts.size, coveredUnique, missing, unassigned }
}

/** 缺字清单 → 升序码位区间（救援建议/复制用） */
export function statsToRanges(list: TextCharStat[]): [number, number][] {
  const sorted = list.map((s) => s.cp).sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const cp of sorted) {
    const last = out.at(-1)
    if (last && last[1] === cp - 1) last[1] = cp
    else out.push([cp, cp])
  }
  return out
}
