// 区块下钻（P1）：把一个汉字区块摊开成「1 格 = 1 码位」的逐字地图 ——
// 亮格 = 已覆盖（分类色提亮）、暗纹格 = 缺失（暗罩 + 斜纹，与全景/详图同语言）、
// 深缝 = 未分配码位（Scripts.txt 口径不计入分母，可视化「分母只数已分配」）。
// 数据全部来自现有 Model（hanTable 区块区间真值 + CoverageModel.missingRanges），
// 本组件纯 View；每行格数为 2 的幂（0xN 对齐），小区块/文字模式自动收拢列数
import { useEffect, useRef } from 'react'
import { CATEGORIES } from '../lib/model'
import type { TipData } from '../components/DetailCard'
import { HAN_BLOCKS } from './lib/hanTable'
import type { CoverageModel } from './lib/coverage'
import { hatchPattern } from './hatch'

const CELL = 12 // 内部绘制格边长（px）；CSS 整体缩放到容器宽
const GAP = 1 // 格间缝：让逐字粒度在缩放后仍可辨

/** 文字模式列数封顶：格子宽 ≈ 容器宽/64（约 18px），格内字符仍可辨认；
 *  中量级区块（扩展A 等）由此从 256 列收拢到 64 列换得格内字符 */
const TEXT_COLS_MAX = 64
/** 文字模式的跨度上限：≤ 0x2000（如扩展A 6592）的区块启用格内字符；
 *  基本区/扩展B 等 2 万+ 级区块即使 64 列也有 300+ 行，维持色块 + 悬停卡片 */
const TEXT_SPAN_MAX = 0x2000
/** 文字模式的内部格边长（px）：提高内部分辨率，CSS 缩小时字仍清晰 */
const TEXT_CELL = 48

/** 画布高/宽比下限：小区块若固定 256 列会被压成一条 ~4px 的线，
 *  无法辨认也无法悬停；按此宽高比收缩列数保证最小可视高度 */
const MIN_ASPECT = 0.07

/** 列数自适应：从 256 逐级减半（16 封底），保持 2 的幂 —— 每行码位数
 *  始终为 0xN（十六进制对齐）；文字模式再封顶到 TEXT_COLS_MAX，
 *  让中量级区块（扩展A/G/H/J 等）的格子放大到可容纳字符 */
function drillCols(span: number, showText: boolean): number {
  let cols = 256
  while (cols > 16 && Math.ceil(span / cols) / cols < MIN_ASPECT) cols /= 2
  return showText ? Math.min(cols, TEXT_COLS_MAX) : cols
}

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
  const span = hb ? hb.end - hb.start + 1 : 0
  const showText = span <= TEXT_SPAN_MAX
  const cols = drillCols(span, showText)

  // 打开/切换区块时滚到可见处
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [name])

  useEffect(() => {
    const cv = cvRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || !hb) return
    const cell = showText ? TEXT_CELL : CELL
    const rows = Math.ceil(span / cols)
    cv.width = cols * cell
    cv.height = rows * cell
    // 底色 = 未分配「深缝」
    ctx.fillStyle = '#141a26'
    ctx.fillRect(0, 0, cv.width, cv.height)
    // 已分配：分类色提亮（覆盖态默认亮格；缺失随后压暗）
    ctx.fillStyle = liftColor(cat.color)
    for (const [s, e] of hb.ranges) {
      for (let cp = s; cp <= e; cp++) {
        const idx = cp - hb.start
        ctx.fillRect((idx % cols) * cell, Math.floor(idx / cols) * cell, cell - GAP, cell - GAP)
      }
    }
    // 缺失：暗罩 + 45° 斜纹（与全景/详图共用 hatchPattern）
    const miss = cov?.missingRanges ?? []
    const hatch = hatchPattern(ctx)
    for (const [s, e] of miss) {
      for (let cp = s; cp <= e; cp++) {
        if (cp < hb.start || cp > hb.end) continue
        const idx = cp - hb.start
        const x = (idx % cols) * cell
        const y = Math.floor(idx / cols) * cell
        ctx.fillStyle = 'rgba(11, 14, 20, 0.85)'
        ctx.fillRect(x, y, cell - GAP, cell - GAP)
        if (hatch) {
          ctx.fillStyle = hatch
          ctx.fillRect(x, y, cell - GAP, cell - GAP)
        }
      }
    }
    // 格内字符：覆盖格白字、缺失格半暗字（画在斜纹之上保持可读）；
    // 未分配码位无字可画，保留深缝。生僻字系统字体缺字形时显示豆腐块，属预期
    if (showText) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${Math.round(cell * 0.6)}px ${getComputedStyle(document.body).fontFamily}`
      let mi = 0
      for (const [s, e] of hb.ranges) {
        for (let cp = s; cp <= e; cp++) {
          const idx = cp - hb.start
          const x = (idx % cols) * cell
          const y = Math.floor(idx / cols) * cell
          while (mi < miss.length && miss[mi][1] < cp) mi++
          const m = miss[mi]
          const missed = !!m && cp >= m[0] && cp <= m[1]
          ctx.fillStyle = missed ? 'rgba(227, 231, 240, 0.5)' : 'rgba(255, 255, 255, 0.95)'
          ctx.fillText(String.fromCodePoint(cp), x + cell / 2, y + cell / 2 + 1)
        }
      }
    }
    // 16 格（= 0x1000）一档的极淡参照线，与整体自相似尺度呼应
    ctx.strokeStyle = 'rgba(227, 231, 240, 0.07)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i < cols / 16; i++) {
      const p = i * 16 * cell + 0.5
      ctx.moveTo(p, 0)
      ctx.lineTo(p, cv.height)
    }
    for (let j = 1; j < rows / 16; j++) {
      const p = j * 16 * cell + 0.5
      ctx.moveTo(0, p)
      ctx.lineTo(cv.width, p)
    }
    ctx.stroke()
  }, [name, hb, cov, cat.color, span, cols, showText])

  if (!hb) return null

  const rows = Math.ceil(span / cols)
  const miss = cov?.missingRanges ?? []

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget
    const rect = cv.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * cols)
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * rows)
    const cp = hb.start + row * cols + col
    if (col < 0 || col >= cols || row < 0 || cp > hb.end) {
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
          {hb.name} · {hex(hb.start)}–{hex(hb.end)} · 每行 0x{cols.toString(16).toUpperCase()}
          {showText ? ' · 格内显示字符' : ''}
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
        className={showText ? 'with-text' : undefined}
        onMouseMove={onMove}
        onMouseLeave={() => onTip(null)}
        aria-label={`${hb.zh}逐字覆盖地图`}
      />
    </div>
  )
}
