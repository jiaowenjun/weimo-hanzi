// 覆盖演示页的全景缩略图：与主页面 Panorama 同一投影（256×256，1 像素 = 1 码位），
// 在区块底图之上叠加「缺失暗罩」——报告 missingRanges 内的码位压暗，覆盖部分保持原色
import { useEffect, useRef } from 'react'
import {
  PLANES,
  PLANE_SIZE,
  CATEGORIES,
  getPlane,
  segmentAt,
  curatedAt,
  unassignedCategory,
  rectsForRange,
  cpAtNorm,
  hex,
} from '../lib/model'
import type { PlaneModel } from '../lib/model'
import type { TipData } from '../components/DetailCard'
import { covMeta, type CoverageModel, type StackEntry } from './lib/coverage'
import { hatchPattern } from './hatch'

const SIZE = 256

/** 码空间共 17 个平面；完全未分配的平面（4–13，无任何区块）不展示 */
const VISIBLE_PLANES = PLANES.filter((p) => getPlane(p.id).segments.length > 0)

/** 缺失暗罩：底色系深色半透明，压在区块色上形成「未点亮」效果 */
const VEIL = 'rgba(11, 14, 20, 0.55)'

function drawPlane(canvas: HTMLCanvasElement, pm: PlaneModel, missing?: [number, number][]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  // 空隙底色（现行数据中 15/16 号平面被 PUA 区块整覆盖，此色不会露出）
  ctx.fillStyle = CATEGORIES[unassignedCategory(pm.meta.id)].color
  ctx.fillRect(0, 0, SIZE, SIZE)
  const base = pm.meta.id * PLANE_SIZE
  for (const seg of pm.segments) {
    ctx.fillStyle = CATEGORIES[seg.category].color
    // rectsForRange 接收平面内相对码位
    for (const r of rectsForRange(seg.start - base, seg.end - base, SIZE, 1)) {
      ctx.fillRect(r.x * SIZE, r.y * SIZE, r.w * SIZE, r.h * SIZE)
    }
  }
  if (!missing) return
  // 缺失标示：先暗罩、再 45° 斜纹（与详图共用 hatchPattern，密度一致）
  const rects: { x: number; y: number; w: number; h: number }[] = []
  for (const [s, e] of missing) {
    const lo = Math.max(s, base)
    const hi = Math.min(e, base + PLANE_SIZE - 1)
    if (hi < lo) continue
    for (const r of rectsForRange(lo - base, hi - base, SIZE, 1)) {
      rects.push({
        x: Math.floor(r.x * SIZE),
        y: Math.floor(r.y * SIZE),
        w: Math.max(1, r.w * SIZE),
        h: Math.max(1, r.h * SIZE),
      })
    }
  }
  ctx.fillStyle = VEIL
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h)
  const hatch = hatchPattern(ctx)
  if (hatch) {
    ctx.fillStyle = hatch
    for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h)
  }
}

interface Props {
  coverage: CoverageModel | null
  /** 字体队列（≥2 时悬停卡片输出逐字体覆盖率行） */
  stack?: StackEntry[]
  /** 并集模型（悬停卡片「合计」行） */
  unionCov?: CoverageModel | null
  onTip: (tip: TipData | null) => void
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
}

export default function CovPanorama({ coverage, stack, unionCov, onTip, showTip }: Props) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    VISIBLE_PLANES.forEach((p, i) => {
      const cv = refs.current[i]
      if (cv) drawPlane(cv, getPlane(p.id), coverage?.missingByPlane.get(p.id))
    })
  }, [coverage])

  const handleMove = (e: React.MouseEvent<Element>, plane: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const cp = cpAtNorm(
      plane * PLANE_SIZE,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
      SIZE,
    )
    const han = curatedAt(cp)
    if (han) {
      showTip(e, {
        title: han.zh,
        subtitle: han.name,
        color: CATEGORIES[han.category].color,
        badge: CATEGORIES[han.category].label,
        meta: [
          { k: '码位', v: hex(cp) },
          { k: '区块范围', v: `${hex(han.start)} – ${hex(han.end)}` },
          ...(han.chars ? [{ k: '已编码字符', v: han.chars }] : []),
          ...(han.version ? [{ k: '引入版本', v: han.version }] : []),
          ...covMeta(han.name, coverage, stack, unionCov),
        ],
        desc: han.desc,
      })
      return
    }
    const raw = segmentAt(cp)
    if (raw) {
      showTip(e, {
        title: raw.name,
        color: CATEGORIES[raw.category].color,
        badge: CATEGORIES[raw.category].label,
        meta: [
          { k: '码位', v: hex(cp) },
          { k: '区块范围', v: `${hex(raw.start)} – ${hex(raw.end)}` },
        ],
      })
      return
    }
    const cat = unassignedCategory(plane)
    showTip(e, {
      title: cat === 'pua' ? '私人使用区（未登记内容）' : '未分配',
      color: CATEGORIES[cat].color,
      badge: CATEGORIES[cat].label,
      meta: [{ k: '码位', v: hex(cp) }],
    })
  }

  return (
    <div className="panorama">
      {VISIBLE_PLANES.map((p, i) => (
        <figure key={p.id} className={`plane-mini${getPlane(p.id).curated.length > 0 ? ' has-han' : ''}`}>
          {/* 事件挂 canvas 而非 figure：figure 含底部说明文字，按其矩形折算码位会偏移 */}
          <canvas
            ref={(el) => {
              refs.current[i] = el
            }}
            width={SIZE}
            height={SIZE}
            onMouseMove={(e) => handleMove(e, p.id)}
            onMouseLeave={() => onTip(null)}
          />
          <figcaption>
            <b>平面 {p.id}</b>
            <span>{p.abbr}</span>
            <em>{p.zh}</em>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
