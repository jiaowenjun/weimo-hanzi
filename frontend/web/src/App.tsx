import { useCallback, useState } from 'react'
import DetailCard, { type TipData } from './components/DetailCard'
import Panorama from './components/Panorama'
import PlaneDetail from './components/PlaneDetail'
import {
  CATEGORIES,
  CATEGORY_ORDER,
  PLANES,
  STATS,
  UNICODE_VERSION_LABEL,
  getPlane,
} from './lib/model'
import './App.css'

// 详图展示哪些平面由数据派生：含汉字相关区块的平面（现为 0–3）
const DETAIL_PLANES = PLANES.filter((p) => getPlane(p.id).curated.length > 0)

function App() {
  const [tip, setTip] = useState<TipData | null>(null)

  const showTip = useCallback(
    (e: { clientX: number; clientY: number }, data: Omit<TipData, 'x' | 'y'>) => {
      setTip({ ...data, x: e.clientX, y: e.clientY })
    },
    [],
  )
  const hideTip = useCallback(() => setTip(null), [])

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">weimo-hanzi · 汉字与 Unicode 调研可视化</p>
        <h1>Unicode 汉字全景图</h1>
        <p className="sub">
          汉字（Han）在 Unicode 码空间中的位置 —— 17 个平面、35 个汉字相关区块、约 10.3 万字
        </p>
        <div className="stat-chips">
          <span className="stat">
            <b>{STATS.totalChars}</b>
            <i>总字符（{UNICODE_VERSION_LABEL}）</i>
          </span>
          <span className="stat">
            <b>{STATS.unifiedTotal}</b>
            <i>统一表意文字</i>
          </span>
          <span className="stat">
            <b>{STATS.hanTotal}</b>
            <i>Script = Han</i>
          </span>
          <span className="stat">
            <b>{STATS.sealChars}</b>
            <i>小篆（18.0 新增）</i>
          </span>
          <span className="stat">
            <b>{STATS.totalScripts}</b>
            <i>文字系统</i>
          </span>
        </div>
        <ul className="legend">
          {CATEGORY_ORDER.map((k) => (
            <li key={k}>
              <span className="sw" style={{ background: CATEGORIES[k].color }} />
              {CATEGORIES[k].label}
            </li>
          ))}
        </ul>
      </header>

      <main>
        <section>
          <h2>
            ① 码空间全景 <span>每像素 = 1 个码位，每平面 256 × 256</span>
          </h2>
          <p className="section-hint">
            悬停任意位置可查看对应码位与区块。红色区域即汉字 —— 常用字集中在平面 0（BMP），
            超过一半的汉字位于平面 2、3（代理对区）；码空间共 17 个平面，
            完全未分配的平面 4–13 已略去。
          </p>
          <Panorama onTip={hideTip} showTip={showTip} />
        </section>

        <section>
          <h2>
            ② 汉字区块详图 <span>每格 = 256 个码位（0x100）· 色块按区块真实起止绘制</span>
          </h2>
          <p className="section-hint">
            标签为区块简短标题，<b>悬停查看详细信息</b>
            （码位范围、字符数、引入版本与说明）。色块边界即区块真实码位起止 ——
            不满一格的区块（如部首补充仅 128 个码位）只覆盖所在格的一半。注意扩展 I 紧邻扩展 F ——
            扩展编号顺序 ≠ 码位顺序。
          </p>
          <div className="plane-grid-list">
            {DETAIL_PLANES.map((p) => (
              <PlaneDetail key={p.id} plane={p} showTip={showTip} onTip={hideTip} />
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>
          工程提示：程序中判断“是否汉字”请使用 <code>{String.raw`/\p{Script=Han}/u`}</code>，
          而不是硬编码码位区间；U+20000 以上的汉字在 JS 中 <code>.length === 2</code>（代理对）。
        </p>
        <p className="sources">
          基线 Unicode 18.0.0（2026-09）·{' '}
          <a href="https://www.unicode.org/Public/18.0.0/ucd/Blocks.txt" target="_blank" rel="noreferrer">
            官方 Blocks.txt
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/jiaowenjun/weimo-hanzi/blob/main/docs/research/2026-11-02-unicode-han-blocks.md"
            target="_blank"
            rel="noreferrer"
          >
            调研报告
          </a>{' '}
          ·{' '}
          <a href="https://www.unicode.org/versions/Unicode18.0.0" target="_blank" rel="noreferrer">
            Unicode 18.0.0
          </a>
        </p>
      </footer>

      <DetailCard tip={tip} />
    </div>
  )
}

export default App
