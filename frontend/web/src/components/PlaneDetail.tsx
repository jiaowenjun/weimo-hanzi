// 平面详图：16×16 网格（每格 = 0x100 码位）+ 侧边区块标签栏
// 标题不叠在网格上，避免遮挡与色彩混淆；hover 双向联动高亮真实轮廓
import { useMemo, useRef, useState } from 'react'
import {
  BUCKET_META,
  PLANE_SIZE,
  hanBlocksSorted,
  hanBlockAt,
  rawBlockAt,
  hex,
} from '../lib/unicode'
import type { PlaneMeta } from '../lib/unicode'
import type { HanBlockInfo } from '../data/hanBlocks'
import type { TipData } from './DetailCard'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface CellStyle {
  bg: string
  han: boolean
}

/** 格子层只作背景纹理：浅色 = 其他文字区块、深色 = PUA、透明 = 未分配。
 *  汉字区块的实际覆盖不再按格涂满，由 fill 层（outlineRects）按真实码位范围精确绘制，
 *  否则不满一格的区块（如部首补充 128 码位占半格）会被误读成一整格 256 个码位 */
function planeCells(plane: number): CellStyle[] {
  const base = plane * PLANE_SIZE
  const cells: CellStyle[] = []
  for (let i = 0; i < 256; i++) {
    const cs = base + i * 0x100
    const ce = cs + 0xff
    let han = false
    for (const b of hanBlocksSorted) {
      if (b.start > ce) break
      if (b.end >= cs) {
        han = true
        break
      }
    }
    const raw = rawBlockAt(cs)
    const isPua = !!raw && raw.name.includes('Private Use')
    cells.push(
      raw
        ? { bg: isPua ? '#232a38' : '#3d516640', han }
        : { bg: 'transparent', han },
    )
  }
  return cells
}

/** 区块真实覆盖范围 → 1~3 段比例矩形（跨行区块呈 C/L 形），全部输出 0~1 比例 */
function outlineRects(b: HanBlockInfo, base: number): Rect[] {
  const cs = (b.start - base) / 0x100 // 起始格（小数，0..255）
  const ce = (b.end - base + 1) / 0x100 // 结束格（开区间，按码位数折算）
  const r0 = Math.floor(cs / 16)
  const r1 = Math.ceil(ce / 16)
  const x1 = (cs - r0 * 16) / 16 // 首行内起点（0..1）
  const x2 = Math.min(1, (ce - (r1 - 1) * 16) / 16) // 末行内终点（0..1）
  if (r0 === r1 - 1) return [{ x: x1, y: r0 / 16, w: x2 - x1, h: 1 / 16 }]
  const rects = [{ x: x1, y: r0 / 16, w: 1 - x1, h: 1 / 16 }]
  if (r1 - r0 > 2) rects.push({ x: 0, y: (r0 + 1) / 16, w: 1, h: (r1 - r0 - 2) / 16 })
  rects.push({ x: 0, y: (r1 - 1) / 16, w: x2, h: 1 / 16 })
  return rects
}

interface Props {
  plane: PlaneMeta
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
  onTip: (tip: TipData | null) => void
}

export default function PlaneDetail({ plane, showTip, onTip }: Props) {
  const [hovered, setHovered] = useState<HanBlockInfo | null>(null)
  const lastCellHit = useRef<string | null>(null)

  const base = plane.id * PLANE_SIZE
  const cells = useMemo(() => planeCells(plane.id), [plane.id])
  const planeBlocks = useMemo(
    () => hanBlocksSorted.filter((b) => b.start >= base && b.end < base + PLANE_SIZE),
    [base],
  )

  const tipOf = (b: HanBlockInfo): Omit<TipData, 'x' | 'y'> => ({
    title: b.zh,
    subtitle: b.name,
    color: BUCKET_META[b.category].color,
    badge: BUCKET_META[b.category].label,
    meta: [
      { k: '区块范围', v: `${hex(b.start)} – ${hex(b.end)}` },
      { k: '码位跨度', v: `${(b.end - b.start + 1).toLocaleString()} 个` },
      ...(b.chars ? [{ k: '已编码字符', v: b.chars }] : []),
      ...(b.version ? [{ k: '引入版本', v: b.version }] : []),
    ],
    desc: b.desc,
  })

  const enter = (b: HanBlockInfo) => (e: React.MouseEvent) => {
    setHovered(b)
    showTip(e, tipOf(b))
  }
  const leave = () => {
    lastCellHit.current = null
    setHovered(null)
    onTip(null)
  }

  /** 悬停格：按鼠标在格内的横向位置折算具体码位，命中哪个区块就高亮哪个。
   *  用 mousemove 而非 mouseenter：同一格被多个区块细分时（如西夏补充/西夏组件补
   *  对半平分一格），格内移动也要重新命中；仅在命中区块变化时才更新高亮状态 */
  const moveCell = (i: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(
      255,
      Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 256)),
    )
    const b = hanBlockAt(base + i * 0x100 + frac)
    if (!b) {
      // 移入格内的非汉字部分（如部首补充左半的补充标点）：清除残留高亮与提示
      if (lastCellHit.current) {
        lastCellHit.current = null
        setHovered(null)
        onTip(null)
      }
      return
    }
    if (lastCellHit.current !== b.name) {
      lastCellHit.current = b.name
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
          <div className="plane-grid">
            {cells.map((c, i) => (
              <div
                key={i}
                className={c.han ? 'cell han' : 'cell'}
                style={{ background: c.bg }}
                onMouseMove={moveCell(i)}
                onMouseLeave={leave}
              />
            ))}
            {/* 汉字区块精确填充层：与悬停轮廓共用 outlineRects 几何，按真实码位范围着色，
                绝对定位于网格内，出界与圆角由网格自身裁剪 */}
            {planeBlocks.flatMap((b) =>
              outlineRects(b, base).map((r, i) => (
                <div
                  key={`fill-${b.name}-${i}`}
                  className={`block-fill${hovered && hovered.name !== b.name ? ' dim' : ''}`}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: BUCKET_META[b.category].color,
                    // 极窄区块（< 1% 网格宽 ≈ 41 码位）加辉光补偿可发现性，如描述符、契丹小字
                    boxShadow:
                      r.w < 0.01 ? `0 0 5px ${BUCKET_META[b.category].color}aa` : undefined,
                  }}
                />
              )),
            )}
          </div>
          {/* hover 时的真实比例轮廓（跨行区块为多段矩形），兼作区块提亮层 */}
          {planeBlocks
            .filter((b) => hovered && b.name === hovered.name)
            .flatMap((b) =>
              outlineRects(b, base).map((r, i) => (
                <div
                  key={`${b.name}-${i}`}
                  className="block-outline"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    borderColor: BUCKET_META[b.category].color,
                    boxShadow: `0 0 14px ${BUCKET_META[b.category].color}66`,
                    background: `${BUCKET_META[b.category].color}2e`,
                  }}
                />
              )),
            )}
        </div>
        <aside className="tray">
          {planeBlocks.map((b) => {
            const hot = !!hovered && hovered.name === b.name
            const color = BUCKET_META[b.category].color
            return (
              <div
                key={b.name}
                className={`tray-item${hot ? ' hot' : ''}`}
                style={
                  hot
                    ? { borderColor: color, background: `${color}1f` }
                    : undefined
                }
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
