// 全局悬浮详情卡：跟随鼠标、靠近边缘自动翻转
export interface TipMeta {
  k: string
  v: string
}

export interface TipData {
  x: number
  y: number
  title: string
  subtitle?: string
  color: string
  badge: string
  meta?: TipMeta[]
  desc?: string
}

export const CARD_W = 300
export const CARD_MAX_H = 280

export function placeCard(x: number, y: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let cx = x + 16
  let cy = y + 18
  if (cx + CARD_W > vw - 8) cx = Math.max(8, x - CARD_W - 16)
  if (cy + CARD_MAX_H > vh - 8) cy = Math.max(8, y - CARD_MAX_H - 12)
  return { cx, cy }
}

export default function DetailCard({ tip }: { tip: TipData | null }) {
  if (!tip) return null
  const { cx, cy } = placeCard(tip.x, tip.y)
  return (
    <div
      className="detail-card"
      style={{ left: cx, top: cy, borderColor: tip.color }}
      role="tooltip"
    >
      <div className="dc-head">
        <span className="dc-badge" style={{ background: tip.color }}>
          {tip.badge}
        </span>
        <span className="dc-title">{tip.title}</span>
      </div>
      {tip.subtitle && <div className="dc-subtitle">{tip.subtitle}</div>}
      {tip.meta && tip.meta.length > 0 && (
        <dl className="dc-meta">
          {tip.meta.map((m) => (
            <div key={m.k}>
              <dt>{m.k}</dt>
              <dd>{m.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {tip.desc && <p className="dc-desc">{tip.desc}</p>}
    </div>
  )
}
