// 缺字救援知识库（数据模型层，P2）：src/data/rescue.json 收录若干款
// 开源（OFL）中文字体的 Han 覆盖区间真值 —— 由 scripts/gen-rescue.mjs 对官方
// 字体文件跑覆盖计算生成。给定一组缺失码位区间，回答「哪款内置字体能补多少字」。
// 知识库只是统计区间（非字体文件），随构建分发；救援结论 = 区间交集计数
import rescueFile from '../../data/rescue.json'
import { intersectRanges } from './union'

export interface RescueFont {
  id: string
  label: string
  license: string
  url: string
  /** Han 覆盖码位升序区间（数值闭区间） */
  ranges: [number, number][]
}

interface RawRescue {
  generatedAt: string
  fonts: { id: string; label: string; license: string; url: string; coveredRanges: [string, string][] }[]
}

const raw = rescueFile as unknown as RawRescue

export const RESCUE_GENERATED_AT = raw.generatedAt
export const RESCUE_FONTS: readonly RescueFont[] = raw.fonts.map((f) => ({
  id: f.id,
  label: f.label,
  license: f.license,
  url: f.url,
  ranges: f.coveredRanges.map(([s, e]) => [Number.parseInt(s, 16), Number.parseInt(e, 16)] as [number, number]),
}))

if (import.meta.env.DEV) {
  for (const f of RESCUE_FONTS) {
    const total = f.ranges.reduce((n, [s, e]) => n + e - s + 1, 0)
    if (total <= 0) throw new Error(`救援字体 ${f.id} 覆盖区间为空`)
  }
}

/** 缺失区间 → 各内置字体可补字数（降序，仅收录 > 0） */
export function rescueAdvice(
  missingRanges: [number, number][],
): { id: string; label: string; count: number; url: string }[] {
  if (missingRanges.length === 0) return []
  return RESCUE_FONTS.map((f) => ({
    id: f.id,
    label: f.label,
    url: f.url,
    count: intersectRanges(missingRanges, f.ranges).reduce((n, [s, e]) => n + e - s + 1, 0),
  }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count)
}
