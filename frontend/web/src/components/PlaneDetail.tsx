// 平面详图：16×16 网格（每格 = 0x100 码位）+ 侧边区块标签栏
// 与全景缩略图共享同一 PlaneModel，仅尺度不同（cols=16, unit=0x100）：
// 背景纹理按区块真实范围绘制（不再按格采样，半格区块不再误染整格），
// 悬停命中在网格级按码位折算，格内移动即可在多个区块间重新命中
import { useRef, useState } from 'react'
import { CATEGORIES, PLANE_SIZE, getPlane, curatedAt, rectsForRange, cpAtNorm, hex } from '../lib/model'
import type { PlaneMeta, CuratedBlock, CategoryId } from '../lib/model'
import type { TipData } from './DetailCard'

const COLS = 16
const UNIT = 0x100
const SPAN = COLS * UNIT // 每行码位数 0x1000

/** 背景纹理只画非汉字区块：other 半透明、PUA 实色；空隙留网格底色。
 *  汉字区块由上层 fill 层全彩精确绘制 */
const BG_STYLE: Partial<Record<CategoryId, string>> = {
  other: `${CATEGORIES.other.color}40`,
  pua: CATEGORIES.pua.color,
}

interface Props {
  plane: PlaneMeta
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
  onTip: (tip: TipData | null) => void
}

export default function PlaneDetail({ plane, showTip, onTip }: Props) {
  const [hovered, setHovered] = useState<CuratedBlock | null>(null)
  const lastHit = useRef<string | null>(null)

  const pm = getPlane(plane.id)
  const base = plane.id * PLANE_SIZE

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

  /** 网格级悬停：按鼠标位置折算具体码位，命中哪个汉字区块就高亮哪个。
   *  同一格被多个区块细分时（如西夏补充/西夏组件补对半平分一格），
   *  格内移动也会重新命中；仅在命中区块变化时才更新高亮状态 */
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
      // 移入汉字区块之间的空隙（如扩展 A 与基本区之间）：清除残留高亮与提示
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
            {/* 汉字区块精确填充层：与悬停轮廓共用 rectsForRange 几何，
                绝对定位于网格内，出界与圆角由网格自身裁剪 */}
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
                    // 极窄区块（< 1% 网格宽 ≈ 41 码位）加辉光补偿可发现性，如描述符、契丹小字
                    boxShadow: r.w < 0.01 ? `0 0 5px ${CATEGORIES[b.category].color}aa` : undefined,
                  }}
                />
              )),
            )}
          </div>
          {/* hover 时的真实比例轮廓（跨行区块为多段矩形），兼作区块提亮层 */}
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
