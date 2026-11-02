// 码空间全景：17 个平面，每平面一张 256×256 缩略图（1 像素 = 1 码位）
import { useEffect, useRef } from 'react'
import { PLANES, PLANE_SIZE, BUCKET_META, bucketAt, rawBlockAt, hanBlockAt, hex } from '../lib/unicode'
import type { TipData } from './DetailCard'

const SIZE = 256

/** 桶 → [r, g, b]（缓存解析结果） */
const rgbCache = new Map<string, [number, number, number]>()
function rgbOf(color: string): [number, number, number] {
  let c = rgbCache.get(color)
  if (!c) {
    c = [
      Number.parseInt(color.slice(1, 3), 16),
      Number.parseInt(color.slice(3, 5), 16),
      Number.parseInt(color.slice(5, 7), 16),
    ]
    rgbCache.set(color, c)
  }
  return c
}

function drawPlane(canvas: HTMLCanvasElement, plane: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(SIZE, SIZE)
  const buf = new Uint32Array(img.data.buffer)
  const base = plane * PLANE_SIZE
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cp = base + y * SIZE + x
      const [r, g, b] = rgbOf(BUCKET_META[bucketAt(cp)].color)
      // 小端 ABGR
      buf[y * SIZE + x] = (255 << 24) | (b << 16) | (g << 8) | r
    }
  }
  ctx.putImageData(img, 0, 0)
}

interface Props {
  onTip: (tip: TipData | null) => void
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
}

export default function Panorama({ onTip, showTip }: Props) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    for (let p = 0; p < PLANES.length; p++) {
      const cv = refs.current[p]
      if (cv) drawPlane(cv, PLANES[p].id)
    }
  }, [])

  const handleMove = (e: React.MouseEvent<Element>, plane: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(255, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * SIZE)))
    const y = Math.min(255, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * SIZE)))
    const cp = plane * PLANE_SIZE + y * SIZE + x
    const han = hanBlockAt(cp)
    if (han) {
      showTip(e, {
        title: han.zh,
        subtitle: han.name,
        color: BUCKET_META[han.category].color,
        badge: BUCKET_META[han.category].label,
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
    const raw = rawBlockAt(cp)
    if (raw) {
      const bucket = bucketAt(cp)
      showTip(e, {
        title: raw.name,
        color: BUCKET_META[bucket].color,
        badge: BUCKET_META[bucket].label,
        meta: [
          { k: '码位', v: hex(cp) },
          { k: '区块范围', v: `${hex(raw.start)} – ${hex(raw.end)}` },
        ],
      })
      return
    }
    showTip(e, {
      title: cp >= 0xf0000 ? '私人使用区（未登记内容）' : '未分配',
      color: BUCKET_META.none.color,
      badge: BUCKET_META.none.label,
      meta: [{ k: '码位', v: hex(cp) }],
    })
  }

  return (
    <div className="panorama">
      {PLANES.map((p, i) => (
        <figure key={p.id} className={`plane-mini${p.id <= 3 ? ' has-han' : ''}`}>
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
