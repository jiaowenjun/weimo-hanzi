// 覆盖演示页的区块详图：与主页面 PlaneDetail 同一投影（16×16 网格，每格 0x100 码位），
// 在汉字区块填充层之上叠加「缺失标示」覆盖层——missingRanges 压暗并打斜纹
import { useEffect, useRef, useState } from 'react'
import {
  CATEGORIES,
  PLANE_SIZE,
  getPlane,
  curatedAt,
  rectsForRange,
  cpAtNorm,
  hex,
} from '../lib/model'
import type { PlaneMeta, CuratedBlock, CategoryId, Rect } from '../lib/model'
import type { TipData } from '../components/DetailCard'
import { covMeta, type CoverageModel } from './lib/coverage'
import { hatchPattern } from './hatch'

const COLS = 16
const UNIT = 0x100
const SPAN = COLS * UNIT // 每行码位数 0x1000
const OSIZE = 512 // 覆盖层画布分辨率（16 格 × 32px，斜纹清晰）

/** 背景纹理只画非汉字区块：other 半透明、PUA 实色；空隙留网格底色。
 *  汉字区块由上层 fill 层全彩精确绘制 */
const BG_STYLE: Partial<Record<CategoryId, string>> = {
  other: `${CATEGORIES.other.color}40`,
  pua: CATEGORIES.pua.color,
}

interface Props {
  plane: PlaneMeta
  coverage: CoverageModel | null
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
  onTip: (tip: TipData | null) => void
}

export default function CovDetail({ plane, coverage, showTip, onTip }: Props) {
  const [hovered, setHovered] = useState<CuratedBlock | null>(null)
  const lastHit = useRef<string | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)

  const pm = getPlane(plane.id)
  const base = plane.id * PLANE_SIZE

  // 缺失标示覆盖层：先暗罩、再斜纹，几何与填充层共用 rectsForRange
  useEffect(() => {
    const cv = overlayRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    ctx.clearRect(0, 0, OSIZE, OSIZE)
    const missing = coverage?.missingByPlane.get(plane.id)
    if (!missing || missing.length === 0) return
    const rects: Rect[] = []
    for (const [s, e] of missing) {
      const lo = Math.max(s, base)
      const hi = Math.min(e, base + PLANE_SIZE - 1)
      if (hi < lo) continue
      rects.push(...rectsForRange(lo - base, hi - base, COLS, UNIT))
    }
    ctx.fillStyle = 'rgba(11, 14, 20, 0.55)'
    for (const r of rects) ctx.fillRect(r.x * OSIZE, r.y * OSIZE, r.w * OSIZE, r.h * OSIZE)
    const hatch = hatchPattern(ctx)
    if (hatch) {
      ctx.fillStyle = hatch
      for (const r of rects) ctx.fillRect(r.x * OSIZE, r.y * OSIZE, r.w * OSIZE, r.h * OSIZE)
    }
  }, [coverage, plane.id, base])

  const tipOf = (b: CuratedBlock): Omit<TipData, 'x' | 'y'> => ({
    title: b.zh,
    subtitle: b.name,
    color: CATEGORIES[b.category].color,
    badge: CATEGORIES[b.category].label,
    meta: [
      { k: '区块范围', v: `${hex(b.start)} – ${hex(b.end)}` },
      { k: '码位跨度', v: `${(b.end - b.start + 1).toLocaleString()} 个` },
      ...(b.chars ? [{ k: '已编码字符', v: b.chars }] : []),
      ...(b.version ? [{ k: '引入版本', v: b.version }] : []),
      ...covMeta(b.name, coverage),
    ],
    desc: b.desc,
  })

  const enter = (b: CuratedBlock) => (e: React.MouseEvent) => {
    setHovered(b)
    showTip(e, tipOf(b))
  }
  const leave = () => {
    lastHit.current = null
    setHovered(null)
    onTip(null)
  }

  /** 网格级悬停：按鼠标位置折算具体码位，命中哪个汉字区块就高亮哪个 */
  const moveGrid = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const cp = cpAtNorm(
      base,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
      SPAN,
    )
    const b = curatedAt(cp)
    if (!b) {
      if (lastHit.current) {
        lastHit.current = null
        setHovered(null)
        onTip(null)
      }
      return
    }
    if (lastHit.current !== b.name) {
      lastHit.current = b.name
      setHovered(b)
    }
    showTip(e, tipOf(b))
  }

  return (
    <div className="plane-detail">
      <div className="plane-head">
        <span className="plane-id">平面 {plane.id}</span>
        <b>{plane.abbr}</b>
        <span className="plane-zh">{plane.zh}</span>
        <span className="plane-note">{plane.note}</span>
      </div>
      <div className="plane-body">
        <div className="plane-grid-wrap">
          <div className="plane-grid" onMouseMove={moveGrid} onMouseLeave={leave}>
            {/* 背景纹理层：非汉字区块按真实码位范围铺 muted 色 */}
            {pm.segments.flatMap((s) => {
              const bg = BG_STYLE[s.category]
              if (!bg) return []
              return rectsForRange(s.start - base, s.end - base, COLS, UNIT).map((r, i) => (
                <div
                  key={`bg-${s.name}-${i}`}
                  className="block-bg"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: bg,
                  }}
                />
              ))
            })}
            {/* 汉字区块精确填充层 */}
            {pm.curated.flatMap((b) =>
              rectsForRange(b.start - base, b.end - base, COLS, UNIT).map((r, i) => (
                <div
                  key={`fill-${b.name}-${i}`}
                  className={`block-fill${hovered && hovered.name !== b.name ? ' dim' : ''}`}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: CATEGORIES[b.category].color,
                    boxShadow: r.w < 0.01 ? `0 0 5px ${CATEGORIES[b.category].color}aa` : undefined,
                  }}
                />
              )),
            )}
            {/* 缺失标示覆盖层：暗罩 + 斜纹，不拦截鼠标事件 */}
            <canvas ref={overlayRef} className="cov-canvas" width={OSIZE} height={OSIZE} />
          </div>
          {/* hover 时的真实比例轮廓，位于覆盖层之上（wrap 的兄弟节点） */}
          {pm.curated
            .filter((b) => hovered && b.name === hovered.name)
            .flatMap((b) =>
              rectsForRange(b.start - base, b.end - base, COLS, UNIT).map((r, i) => (
                <div
                  key={`${b.name}-${i}`}
                  className="block-outline"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    borderColor: CATEGORIES[b.category].color,
                    boxShadow: `0 0 14px ${CATEGORIES[b.category].color}66`,
                    background: `${CATEGORIES[b.category].color}2e`,
                  }}
                />
              )),
            )}
        </div>
        <aside className="tray">
          {pm.curated.map((b) => {
            const hot = !!hovered && hovered.name === b.name
            const color = CATEGORIES[b.category].color
            return (
              <div
                key={b.name}
                className={`tray-item${hot ? ' hot' : ''}`}
                style={hot ? { borderColor: color, background: `${color}1f` } : undefined}
                onMouseEnter={enter(b)}
                onMouseLeave={leave}
              >
                <span className="dot" style={{ background: color }} />
                <span className="tray-title">{b.short}</span>
                <span className="rg">{hex(b.start).slice(2)}</span>
              </div>
            )
          })}
        </aside>
      </div>
      <div className="plane-axis">
        <span>{hex(base)}</span>
        <span className="axis-hint">每列 0x100 · 每行 0x1000</span>
        <span>{hex(base + 0xffff)}</span>
      </div>
    </div>
  )
}
