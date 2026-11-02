// 字体覆盖热力图演示页（/coverage.html）：直接选择字体文件（可多选）在浏览器内
// 实时计算覆盖度，或载入 font-coverage 报告 JSON。多款字体按「字体栈」语义取并集：
// 总体覆盖 = 并集（默认视图），队列中可切换/移除单字体查看各自的覆盖。
// 缺失标示叠加到码空间全景与区块详图 —— 暗罩/斜纹 = 当前视图缺失的码位，
// 保持原色 = 已覆盖。复用主页面组件体系与全局样式，不改动主页面任何代码
import { useCallback, useMemo, useState } from 'react'
import DetailCard, { type TipData } from '../components/DetailCard'
import { CATEGORIES, CATEGORY_ORDER, PLANES, UNICODE_VERSION_LABEL, getPlane } from '../lib/model'
import CovPanorama from './CovPanorama'
import CovDetail from './CovDetail'
import { parseCoverageReport, type CoverageModel, type Subtotal, type StackEntry } from './lib/coverage'
import { loadFontCoverage } from './lib/fontLoad'
import { unionModels } from './lib/union'

// 详图展示哪些平面由数据派生：含汉字相关区块的平面（现为 0–3）
const DETAIL_PLANES = PLANES.filter((p) => getPlane(p.id).curated.length > 0)

const pct = (s: Subtotal) => `${(s.coverage * 100).toFixed(1)}%`

/** 字体队列条目：一个字体文件成员（ttc 逐成员展开）或一份报告 JSON */
interface QueueEntry {
  id: string
  model: CoverageModel
}

let uid = 0
const nextId = () => `f${++uid}-${Date.now().toString(36)}`

export default function CoverageDemo() {
  const [tip, setTip] = useState<TipData | null>(null)
  const [queue, setQueue] = useState<QueueEntry[]>([])
  /** 当前激活视图：'' = 合计（并集）；否则为队列条目 id */
  const [activeId, setActiveId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  /** 总体 = 队列全部字体的并集（≥2 款时才有意义） */
  const overall = useMemo(
    () => (queue.length >= 2 ? unionModels(queue.map((q) => q.model)) : null),
    [queue],
  )
  const activeModel = useMemo(() => {
    if (activeId) {
      const hit = queue.find((q) => q.id === activeId)
      if (hit) return hit.model
    }
    return overall ?? queue[0]?.model ?? null
  }, [queue, activeId, overall])
  /** 悬停卡片的逐字体行（含各字体自己的覆盖率） */
  const stack: StackEntry[] = useMemo(
    () => queue.map((q) => ({ label: q.model.label, blocksByName: q.model.blocksByName })),
    [queue],
  )

  const showTip = useCallback(
    (e: { clientX: number; clientY: number }, data: Omit<TipData, 'x' | 'y'>) => {
      setTip({ ...data, x: e.clientX, y: e.clientY })
    },
    [],
  )
  const hideTip = useCallback(() => setTip(null), [])

  const clearAll = () => {
    setQueue([])
    setActiveId('')
    setErr(null)
  }
  const removeEntry = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id))
    if (activeId === id) setActiveId('')
  }

  /** 追加一个模型列表（字体文件的各成员 / 报告 JSON 的单模型），并切到合计视图 */
  const appendModels = (models: CoverageModel[]) => {
    setQueue((prev) => [...prev, ...models.map((m) => ({ id: nextId(), model: m }))])
    setActiveId('')
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // 允许再次选择同一文件
    if (files.length === 0) return
    setErr(null)
    for (const f of files) {
      try {
        if (f.name.toLowerCase().endsWith('.json')) {
          const parsed = parseCoverageReport(JSON.parse(await f.text()))
          if ('error' in parsed) throw new Error(parsed.error)
          appendModels([parsed])
        } else {
          const buf = await f.arrayBuffer()
          const models = await loadFontCoverage(buf, setBusy)
          appendModels(models)
        }
      } catch (ex) {
        setErr(`${f.name}：${ex instanceof Error ? ex.message : String(ex)}`)
      } finally {
        setBusy(null)
      }
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">weimo-hanzi · 字体覆盖度演示</p>
        <h1>字体汉字覆盖热力图</h1>
        <p className="sub">
          选择字体文件即可在浏览器内实时计算汉字覆盖度（可多选组合，总体 = 并集），也可载入
          font-coverage 报告 JSON —— 色块保持原色 = 已覆盖，暗罩 + 斜纹 = 缺失码位，
          在 Unicode {UNICODE_VERSION_LABEL} 码空间上直接看到一款字体「缺哪些字」
        </p>

        <div className="cov-bar">
          <label className="cov-btn">
            添加字体文件（可多选）或报告 JSON
            <input
              type="file"
              multiple
              accept=".json,.ttf,.otf,.ttc,.woff,.woff2,application/json,font/ttf,font/otf,font/collection,font/woff,font/woff2"
              hidden
              onChange={onFile}
            />
          </label>
          {busy && (
            <span className="cov-busy" role="status">
              <span className="spin" aria-hidden />
              {busy}
            </span>
          )}
          {!busy && activeModel && (
            <span className="cov-chip" title={activeModel.sublabel}>
              <b>{activeModel.label}</b>
              <i>{activeModel.sublabel}</i>
              <em>{pct(activeModel.summary.total)}</em>
              <button type="button" onClick={clearAll} aria-label="清空">
                ✕
              </button>
            </span>
          )}
          {err && <span className="cov-err">{err}</span>}
          <span className="cov-hint">总体覆盖 = 各字体并集（字体栈语义）· 本地计算，不上传任何数据</span>
        </div>

        {queue.length > 0 && (
          <div className="cov-queue" role="tablist" aria-label="字体队列与视图切换">
            {overall && (
              <button
                type="button"
                role="tab"
                aria-selected={activeId === ''}
                className={`cov-qrow cov-qall${activeId === '' ? ' active' : ''}`}
                onClick={() => setActiveId('')}
              >
                <span className="q-label">Σ 合计（{queue.length} 款并集）</span>
                <span className="q-pct">{pct(overall.summary.total)}</span>
              </button>
            )}
            {queue.map((q) => (
              <div
                key={q.id}
                className={`cov-qrow${activeId === q.id ? ' active' : ''}`}
                role="tab"
                aria-selected={activeId === q.id}
                onClick={() => setActiveId(q.id)}
              >
                <span className="q-label" title={q.model.sublabel}>
                  {q.model.label}
                </span>
                <span className="q-pct">{pct(q.model.summary.total)}</span>
                <button
                  type="button"
                  className="q-remove"
                  aria-label={`移除 ${q.model.label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeEntry(q.id)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {activeModel && (
          <div className="stat-chips">
            <span className="stat">
              <b>
                {activeModel.summary.total.covered.toLocaleString()}{' '}
                <i className="pct-of">/ {activeModel.summary.total.assigned.toLocaleString()}</i>
              </b>
              <i>13 区块覆盖 · {pct(activeModel.summary.total)}</i>
            </span>
            <span className="stat">
              <b>{pct(activeModel.summary.unified)}</b>
              <i>统一表意（11 区块）</i>
            </span>
            <span className="stat">
              <b>{pct(activeModel.summary.compat)}</b>
              <i>兼容表意（2 区块）</i>
            </span>
            <span className="stat">
              <b>{pct(activeModel.summary.scattered)}</b>
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
          {activeModel && (
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
            {activeModel
              ? `${activeModel.label}（${activeModel.sublabel}）：亮色部分为已覆盖的码位，暗罩为缺失。汉字集中在平面 0/2/3 —— 一款字体「日常够不够用、古籍够不够用」一目了然。悬停可查看区块级覆盖率。`
              : '尚未选择文件 —— 当前展示的是无叠加的码空间底图。选择字体文件后，这里会实时计算并以斜纹暗罩标示该字体缺失的码位。'}
          </p>
          <CovPanorama
            coverage={activeModel}
            stack={stack}
            unionCov={overall}
            onTip={hideTip}
            showTip={showTip}
          />
        </section>

        <section>
          <h2>
            ② 汉字区块详图 <span>每格 = 256 个码位（0x100）· 斜纹 = 缺失</span>
          </h2>
          <p className="section-hint">
            区块内缺失呈<b>斜纹暗罩</b>，覆盖部分保持分类色。悬停查看当前视图在此区块的覆盖率与缺失字数
            {stack.length >= 2 ? '，并对比队列中每款字体各自的覆盖情况' : ''}。
          </p>
          <div className="plane-grid-list">
            {DETAIL_PLANES.map((p) => (
              <CovDetail
                key={p.id}
                plane={p}
                coverage={activeModel}
                stack={stack}
                unionCov={overall}
                showTip={showTip}
                onTip={hideTip}
              />
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>
          覆盖率分母为 Unicode {UNICODE_VERSION_LABEL} 官方 Scripts.txt 中实际已分配的 Script=Han 码位；
          主口径 = 13 个表意区块，散居部首/符号区块单列。总体覆盖 = 各字体 cmap 并集（缺失取交集）。
        </p>
        <p className="sources">
          浏览器端实时计算与 CLI（pnpm coverage）共用同一参考标准 src/data/han-assigned.json ·{' '}
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
