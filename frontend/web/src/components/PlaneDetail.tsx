// 平面详图：16×16 网格（每格 = 0x100 码位）+ 侧边区块标签栏
// 标题不叠在网格上，避免遮挡与色彩混淆；hover 双向联动高亮真实轮廓
import { useMemo, useState } from 'react'
import {
  BUCKET_META,
  PLANE_SIZE,
  hanBlocksSorted,
  rawBlockAt,
  overlapLen,
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
  key: string | null
}

function planeCells(plane: number): CellStyle[] {
  const base = plane * PLANE_SIZE
  const cells: CellStyle[] = []
  for (let i = 0; i < 256; i++) {
    const cs = base + i * 0x100
    const ce = cs + 0xff
    let best: HanBlockInfo | null = null
    let bestLen = 0
    for (const b of hanBlocksSorted) {
      if (b.start > ce) break
      const len = overlapLen(b.start, b.end, cs, ce)
      if (len > bestLen) {
        best = b
        bestLen = len
      }
    }
    if (best) {
      const frac = bestLen / 0x100
      const c = BUCKET_META[best.category].color
      cells.push({
        bg: `${c}${Math.round((0.38 + 0.5 * Math.min(1, frac)) * 255)
          .toString(16)
          .padStart(2, '0')}`,
        key: best.name,
      })
    } else {
      const raw = rawBlockAt(cs)
      const isPua = !!raw && raw.name.includes('Private Use')
      cells.push(
        raw
          ? { bg: isPua ? '#232a38' : '#3d516640', key: null }
          : { bg: 'transparent', key: null },
      )
    }
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
  const [hovered, setHovered] = useState<string | null>(null)

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
    setHovered(b.name)
    showTip(e, tipOf(b))
  }
  const leave = () => {
    setHovered(null)
    onTip(null)
  }

  return (
    <div className={`plane-detail${hovered ? ' focused' : ''}`}>
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
                className={
                  c.key
                    ? `cell han${c.key === hovered ? ' hot' : ''}${hovered && c.key !== hovered ? ' dim' : ''}`
                    : 'cell'
                }
                style={{ background: c.bg }}
                onMouseEnter={(e) => {
                  const b = hanBlocksSorted.find((x) => x.name === c.key)
                  if (!b) return
                  enter(b)(e)
                }}
                onMouseLeave={leave}
              />
            ))}
          </div>
          {/* hover 时的真实比例轮廓（跨行区块为多段矩形） */}
          {planeBlocks
            .filter((b) => b.name === hovered)
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
                  }}
                />
              )),
            )}
        </div>
        <aside className="tray">
          {planeBlocks.map((b) => {
            const hot = b.name === hovered
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
