// 码空间全景：每平面一张 256×256 缩略图（1 像素 = 1 码位），仅展示有区块的平面
// 绘制与命中均走 model 的统一投影：rectsForRange(…, 256, 1) / cpAtNorm(…, 0x100)，
// 与区块详图（PlaneDetail，cols=16/unit=0x100）共享同一套几何
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
import type { TipData } from './DetailCard'

const SIZE = 256

/** 码空间共 17 个平面；完全未分配的平面（4–13，无任何区块）不展示 */
const VISIBLE_PLANES = PLANES.filter((p) => getPlane(p.id).segments.length > 0)

function drawPlane(canvas: HTMLCanvasElement, pm: PlaneModel) {
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
      // 区块边界均为整数码位 → 像素坐标恰为整数，与逐像素绘制完全一致
      ctx.fillRect(r.x * SIZE, r.y * SIZE, r.w * SIZE, r.h * SIZE)
    }
  }
}

interface Props {
  onTip: (tip: TipData | null) => void
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
}

export default function Panorama({ onTip, showTip }: Props) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    VISIBLE_PLANES.forEach((p, i) => {
      const cv = refs.current[i]
      if (cv) drawPlane(cv, getPlane(p.id))
    })
  }, [])

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
