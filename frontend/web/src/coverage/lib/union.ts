// 多字体并集（字体栈语义）：总体覆盖 = 各字体 cmap 并集，
// 等价地：总体缺失 = 各字体缺失区间列表的逐块交集。
// 两条输入通道（浏览器实时计算 / 报告 JSON 解析）产出的 BlockCov 均携带
// per-block missingRanges，因此并集对两种来源统一成立
import { HAN_BLOCKS } from './hanTable'
import { bucketByPlane, subtotal } from './compute'
import type { CoverageModel, BlockCov } from './coverage'

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

const count = (ranges: [number, number][]) => ranges.reduce((n, [s, e]) => n + e - s + 1, 0)

/** 多字体并集模型：与单字体 CoverageModel 同构，直接驱动两视图渲染 */
export function unionModels(models: CoverageModel[]): CoverageModel {
  const blocksByName = new Map<string, BlockCov>()
  const unifiedVals: { assigned: number; covered: number }[] = []
  const compatVals: { assigned: number; covered: number }[] = []
  const scatteredVals: { assigned: number; covered: number }[] = []
  const missingAll: [number, number][] = []

  for (const hb of HAN_BLOCKS) {
    // 逐字体对缺失区间求交；任一字体缺该块数据（不应发生）则交集为空
    let inter: [number, number][] | null = null
    for (const m of models) {
      const miss = m.blocksByName.get(hb.name)?.missingRanges
      if (!miss) {
        inter = []
        break
      }
      inter = inter === null ? miss.map((r) => [r[0], r[1]] as [number, number]) : intersectRanges(inter, miss)
      if (inter.length === 0) break
    }
    const missing = inter ?? []
    const missingCount = count(missing)
    const covered = hb.assigned - missingCount
    blocksByName.set(hb.name, {
      covered,
      assigned: hb.assigned,
      coverage: hb.assigned === 0 ? 0 : +(covered / hb.assigned).toFixed(6),
      missingCount,
      missingRanges: missing,
    })
    ;(hb.category === 'unified'
      ? unifiedVals
      : hb.category === 'compat'
        ? compatVals
        : scatteredVals
    ).push({ assigned: hb.assigned, covered })
    missingAll.push(...missing)
  }

  return {
    label: `合计 · ${models.length} 款字体并集`,
    sublabel: models.map((m) => m.label).join(' + '),
    summary: {
      total: subtotal([...unifiedVals, ...compatVals]),
      unified: subtotal(unifiedVals),
      compat: subtotal(compatVals),
      scattered: subtotal(scatteredVals),
    },
    blocksByName,
    missingByPlane: bucketByPlane(missingAll),
  }
}
