// 区块下钻（P1）：把一个汉字区块摊开成「1 格 = 1 码位」的逐字地图 ——
// 亮格 = 已覆盖（分类色提亮）、暗纹格 = 缺失（暗罩 + 斜纹，与全景/详图同语言）、
// 深缝 = 未分配码位（Scripts.txt 口径不计入分母，可视化「分母只数已分配」）。
// 数据全部来自现有 Model（hanTable 区间真值 + CoverageModel.missingRanges），
// 本组件纯 View；每行 256 格 = 0x100，与全景/详图的自相似尺度一致
import { useEffect, useRef } from 'react'
import { CATEGORIES } from '../lib/model'
import type { TipData } from '../components/DetailCard'
import { HAN_BLOCKS } from './lib/hanTable'
import type { CoverageModel } from './lib/coverage'
import { hatchPattern } from './hatch'

const COLS = 256 // 每行码位数 = 0x100，与详图「每格 0x100」同一进制语义
const CELL = 12 // 内部绘制格边长（px）；CSS 整体缩放到容器宽
const GAP = 1 // 格间缝：让逐字粒度在缩放后仍可辨

const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0')

/** 覆盖格提亮：分类色向白混合，与全景覆盖区高光同一手法 */
function liftColor(hexColor: string, ratio = 0.08): string {
  const v = Number.parseInt(hexColor.slice(1), 16)
  const mix = (c: number) => Math.min(255, c + Math.round((255 - c) * ratio))
  const r = mix((v >> 16) & 0xff)
  const g = mix((v >> 8) & 0xff)
  const b = mix(v & 0xff)
  return `rgb(${r}, ${g}, ${b})`
}

interface Props {
  /** 官方区块名（hanTable / 报告 JSON 同名键） */
  name: string
  coverage: CoverageModel | null
  onClose: () => void
  showTip: (e: { clientX: number; clientY: number }, tip: Omit<TipData, 'x' | 'y'>) => void
  onTip: (tip: TipData | null) => void
}

export default function CovBlockDrill({ name, coverage, onClose, showTip, onTip }: Props) {
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const hb = HAN_BLOCKS.find((b) => b.name === name)
  const cov = coverage?.blocksByName.get(name) ?? null
  const cat = hb ? ((CATEGORIES as Record<string, { color: string; label: string }>)[hb.category] ?? CATEGORIES.other) : CATEGORIES.other

  // 打开/切换区块时滚到可见处
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [name])

  useEffect(() => {
    const cv = cvRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || !hb) return
    const span = hb.end - hb.start + 1
    const rows = Math.ceil(span / COLS)
    cv.width = COLS * CELL
    cv.height = rows * CELL
    // 底色 = 未分配「深缝」
    ctx.fillStyle = '#141a26'
    ctx.fillRect(0, 0, cv.width, cv.height)
    // 已分配：分类色提亮（覆盖态默认亮格；缺失随后压暗）
    ctx.fillStyle = liftColor(cat.color)
    for (const [s, e] of hb.ranges) {
      for (let cp = s; cp <= e; cp++) {
        const idx = cp - hb.start
        ctx.fillRect((idx % COLS) * CELL, Math.floor(idx / COLS) * CELL, CELL - GAP, CELL - GAP)
      }
    }
    // 缺失：暗罩 + 45° 斜纹（与全景/详图共用 hatchPattern）
    const miss = cov?.missingRanges ?? []
    const hatch = hatchPattern(ctx)
    for (const [s, e] of miss) {
      for (let cp = s; cp <= e; cp++) {
        if (cp < hb.start || cp > hb.end) continue
        const idx = cp - hb.start
        const x = (idx % COLS) * CELL
        const y = Math.floor(idx / COLS) * CELL
        ctx.fillStyle = 'rgba(11, 14, 20, 0.85)'
        ctx.fillRect(x, y, CELL - GAP, CELL - GAP)
        if (hatch) {
          ctx.fillStyle = hatch
          ctx.fillRect(x, y, CELL - GAP, CELL - GAP)
        }
      }
    }
    // 16 格（= 0x1000）一档的极淡参照线，与整体自相似尺度呼应
    ctx.strokeStyle = 'rgba(227, 231, 240, 0.07)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i < COLS / 16; i++) {
      const p = i * 16 * CELL + 0.5
      ctx.moveTo(p, 0)
      ctx.lineTo(p, cv.height)
    }
    for (let j = 1; j < rows / 16; j++) {
      const p = j * 16 * CELL + 0.5
      ctx.moveTo(0, p)
      ctx.lineTo(cv.width, p)
    }
    ctx.stroke()
  }, [name, hb, cov, cat.color])

  if (!hb) return null

  const rows = Math.ceil((hb.end - hb.start + 1) / COLS)
  const miss = cov?.missingRanges ?? []

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget
    const rect = cv.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS)
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * rows)
    const cp = hb.start + row * COLS + col
    if (col < 0 || col >= COLS || row < 0 || cp > hb.end) {
      onTip(null)
      return
    }
    const assigned = hb.ranges.some(([s, en]) => cp >= s && cp <= en)
    const missed = assigned && miss.some(([s, en]) => cp >= s && cp <= en)
    showTip(e, {
      title: String.fromCodePoint(cp),
      subtitle: `${hb.zh} · ${hex(cp)}`,
      color: cat.color,
      badge: cat.label,
      meta: [
        { k: '码位', v: `U+${hex(cp)}` },
        { k: '状态', v: !assigned ? '未分配（不计入分母）' : missed ? '缺失' : '已覆盖' },
        ...(cov ? [{ k: '区块覆盖', v: `${cov.covered.toLocaleString()} / ${cov.assigned.toLocaleString()}（${(cov.coverage * 100).toFixed(1)}%）` }] : []),
      ],
    })
  }

  return (
    <div className="drill" ref={rootRef}>
      <div className="drill-head">
        <b>{hb.zh}</b>
        <span className="rg">
          {hb.name} · {hex(hb.start)}–{hex(hb.end)}
        </span>
        {cov && (
          <>
            <span className="drill-bar" title={`覆盖 ${cov.covered.toLocaleString()} / ${cov.assigned.toLocaleString()}`}>
              <i style={{ width: `${Math.max(1, cov.coverage * 100).toFixed(1)}%`, background: cat.color }} />
            </span>
            <span className="drill-pct">{(cov.coverage * 100).toFixed(1)}%</span>
            <span className="drill-sub">
              {cov.covered.toLocaleString()} / {cov.assigned.toLocaleString()}
            </span>
          </>
        )}
        <button type="button" className="drill-close" onClick={onClose} aria-label="关闭下钻">
          ✕ 关闭
        </button>
      </div>
      <canvas
        ref={cvRef}
    onMouseMove={onMove}
    onMouseLeave={() => onTip(null)}
    aria-label={`${hb.zh}逐字覆盖地图`}
  />
    </div>
  )
}
