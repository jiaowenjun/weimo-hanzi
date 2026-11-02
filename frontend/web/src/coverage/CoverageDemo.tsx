// 字体覆盖热力图演示页（/coverage.html）：载入 font-coverage 报告 JSON，
// 以「缺失标示」叠加到码空间全景与区块详图 —— 暗罩/斜纹 = 该字体缺失的码位，
// 保持原色 = 已覆盖。复用主页面组件体系与全局样式，不改动主页面任何代码
import { useCallback, useState } from 'react'
import DetailCard, { type TipData } from '../components/DetailCard'
import { CATEGORIES, CATEGORY_ORDER, PLANES, UNICODE_VERSION_LABEL, getPlane } from '../lib/model'
import CovPanorama from './CovPanorama'
import CovDetail from './CovDetail'
import { parseCoverageReport, type CoverageModel, type Subtotal } from './lib/coverage'

// 详图展示哪些平面由数据派生：含汉字相关区块的平面（现为 0–3）
const DETAIL_PLANES = PLANES.filter((p) => getPlane(p.id).curated.length > 0)

const pct = (s: Subtotal) => `${(s.coverage * 100).toFixed(1)}%`

export default function CoverageDemo() {
  const [tip, setTip] = useState<TipData | null>(null)
  const [coverage, setCoverage] = useState<CoverageModel | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const showTip = useCallback(
    (e: { clientX: number; clientY: number }, data: Omit<TipData, 'x' | 'y'>) => {
      setTip({ ...data, x: e.clientX, y: e.clientY })
    },
    [],
  )
  const hideTip = useCallback(() => setTip(null), [])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 允许再次选择同一文件
    if (!f) return
    try {
      const parsed = parseCoverageReport(JSON.parse(await f.text()))
      if ('error' in parsed) {
        setCoverage(null)
        setErr(parsed.error)
      } else {
        setErr(null)
        setCoverage(parsed)
      }
    } catch (ex) {
      setCoverage(null)
      setErr(`文件读取失败：${ex instanceof Error ? ex.message : String(ex)}`)
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">weimo-hanzi · 字体覆盖度演示</p>
        <h1>字体汉字覆盖热力图</h1>
        <p className="sub">
          载入覆盖报告后，色块保持原色 = 字体已覆盖，暗罩 + 斜纹 = 缺失码位 ——
          在 Unicode {UNICODE_VERSION_LABEL} 码空间上直接看到一款字体「缺哪些字」
        </p>

        <div className="cov-bar">
          <label className="cov-btn">
            载入覆盖报告（.coverage.json）
            <input type="file" accept=".json,application/json" hidden onChange={onFile} />
          </label>
          {coverage && (
            <span className="cov-chip" title={coverage.sublabel}>
              <b>{coverage.label}</b>
              <i>{coverage.sublabel}</i>
              <em>{pct(coverage.summary.total)}</em>
              <button type="button" onClick={() => setCoverage(null)} aria-label="清除报告">
                ✕
              </button>
            </span>
          )}
          {err && <span className="cov-err">{err}</span>}
          <span className="cov-hint">先用 pnpm coverage &lt;字体文件&gt; 生成报告，再载入</span>
        </div>

        {coverage && (
          <div className="stat-chips">
            <span className="stat">
              <b>
                {coverage.summary.total.covered.toLocaleString()} <i className="pct-of">/ {coverage.summary.total.assigned.toLocaleString()}</i>
              </b>
              <i>13 区块覆盖 · {pct(coverage.summary.total)}</i>
            </span>
            <span className="stat">
              <b>{pct(coverage.summary.unified)}</b>
              <i>统一表意（11 区块）</i>
            </span>
            <span className="stat">
              <b>{pct(coverage.summary.compat)}</b>
              <i>兼容表意（2 区块）</i>
            </span>
            <span className="stat">
              <b>{pct(coverage.summary.scattered)}</b>
              <i>散居 Han（部首/符号）</i>
            </span>
          </div>
        )}

        <ul className="legend">
          {CATEGORY_ORDER.map((k) => (
            <li key={k}>
              <span className="sw" style={{ background: CATEGORIES[k].color }} />
              {CATEGORIES[k].label}
            </li>
          ))}
          {coverage && (
            <li>
              <span className="sw sw-miss" />
              缺失标示（暗罩 + 斜纹）
            </li>
          )}
        </ul>
      </header>

      <main>
        <section>
          <h2>
            ① 码空间全景 <span>每像素 = 1 个码位 · 斜纹暗罩 = 缺失</span>
          </h2>
          <p className="section-hint">
            {coverage
              ? `${coverage.label}（${coverage.sublabel}）：亮色部分为该字体已覆盖的码位，暗罩为缺失。汉字集中在平面 0/2/3 —— 一款字体「日常够不够用、古籍够不够用」一目了然。悬停可查看区块级覆盖率。`
              : '尚未载入报告 —— 当前展示的是无叠加的码空间底图。生成并载入报告后，这里会以斜纹暗罩标示该字体缺失的码位。'}
          </p>
          <CovPanorama coverage={coverage} onTip={hideTip} showTip={showTip} />
        </section>

        <section>
          <h2>
            ② 汉字区块详图 <span>每格 = 256 个码位（0x100）· 斜纹 = 缺失</span>
          </h2>
          <p className="section-hint">
            区块内缺失呈<b>斜纹暗罩</b>，覆盖部分保持分类色。悬停查看该字体在此区块的覆盖率与缺失字数。
          </p>
          <div className="plane-grid-list">
            {DETAIL_PLANES.map((p) => (
              <CovDetail key={p.id} plane={p} coverage={coverage} showTip={showTip} onTip={hideTip} />
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>
          覆盖率分母为 Unicode {UNICODE_VERSION_LABEL} 官方 Scripts.txt 中实际已分配的 Script=Han 码位；
          主口径 = 13 个表意区块，散居部首/符号区块单列。检测工具与数据口径见仓库
          <code>frontend/web/scripts/font-coverage.mjs</code>。
        </p>
        <p className="sources">
          <a href="/">← 返回主全景页</a> ·{' '}
          <a
            href="https://github.com/jiaowenjun/weimo-hanzi/blob/main/docs/research/2026-11-02-unicode-han-blocks.md"
            target="_blank"
            rel="noreferrer"
          >
            调研报告
          </a>
        </p>
      </footer>

      <DetailCard tip={tip} />
    </div>
  )
}
