// 字体覆盖热力图演示页（/coverage.html）—— 纯 View 层。
// 数据链路（MV）：字体文件/报告 JSON → CoverageReportFile（唯一数据模型，
// lib/report.ts）→ 组装层 lib/coverage.ts（ViewModel + 芯片/悬停数据）→
// 本组件与 CovPanorama/CovDetail 渲染；多字体并集 = lib/union.ts 在数据层求交。
// 本组件只持有「队列内容 + 激活视图」两个 UI 状态，不包含任何解析/计算逻辑
import { useCallback, useMemo, useState } from 'react'
import DetailCard, { type TipData } from '../components/DetailCard'
import { CATEGORIES, CATEGORY_ORDER, PLANES, UNICODE_VERSION_LABEL, getPlane } from '../lib/model'
import CovPanorama from './CovPanorama'
import CovDetail from './CovDetail'
import CovBlockDrill from './CovBlockDrill'
import {
  assembleViewModel,
  statChips,
  type CoverageModel,
  type StackEntry,
} from './lib/coverage'
import { validateReportFile, type CoverageReportFile } from './lib/report'
import { loadFontReports } from './lib/fontLoad'
import { unionReports } from './lib/union'
import { marginalContributions } from './lib/marginal'
import { HAN_BLOCKS } from './lib/hanTable'

// 详图展示哪些平面由数据派生：含汉字相关区块的平面（现为 0–3）
const DETAIL_PLANES = PLANES.filter((p) => getPlane(p.id).curated.length > 0)

const pct = (m: CoverageModel) => `${(m.summary.total.coverage * 100).toFixed(1)}%`

/** 字体队列条目：一个字体文件成员（ttc 逐成员展开）或一份报告 JSON */
interface QueueEntry {
  id: string
  report: CoverageReportFile
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
  /** 下钻选中的区块名（官方名）；null = 未下钻 */
  const [drill, setDrill] = useState<string | null>(null)

  // —— 组装（Model）：报告 → 视图数据，全部 memo 化 ——
  const views = useMemo(() => queue.map((q) => ({ id: q.id, model: assembleViewModel(q.report) })), [queue])
  const models = useMemo(() => queue.map((q) => q.report), [queue])
  const overall = useMemo(
    () => (models.length >= 2 ? assembleViewModel(unionReports(models)) : null),
    [models],
  )
  const activeModel = useMemo(() => {
    if (activeId) {
      const hit = views.find((v) => v.id === activeId)
      if (hit) return hit.model
    }
    return overall ?? views[0]?.model ?? null
  }, [views, activeId, overall])
  /** 当前激活视图对应的报告（导出用）；单字体 = 其报告，合计 = 并集报告 */
  const activeReport = useMemo(() => {
    if (activeId) {
      const hit = queue.find((q) => q.id === activeId)
      if (hit) return hit.report
    }
    return models.length >= 2 ? unionReports(models) : (queue[0]?.report ?? null)
  }, [queue, activeId, models])
  const chips = useMemo(() => statChips(activeModel), [activeModel])
  /** 并集边际贡献（派生数据，队列顺序 = 并入顺序） */
  const marginal = useMemo(() => marginalContributions(models), [models])
  /** 下钻区块的中文名（标题用，hanTable 挂接） */
  const drillBlockZh = useMemo(() => HAN_BLOCKS.find((b) => b.name === drill)?.zh ?? drill, [drill])
  const stack: StackEntry[] = useMemo(
    () =>
      views.map((v, i) => ({
        label: v.model.label,
        blocksByName: v.model.blocksByName,
        addTotal: marginal[i]?.total,
        addByBlock: marginal[i]?.byBlock,
      })),
    [views, marginal],
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
  const appendReports = (reports: CoverageReportFile[]) => {
    setQueue((prev) => [...prev, ...reports.map((r) => ({ id: nextId(), report: r }))])
    setActiveId('')
  }

  /** 导出当前视图的报告 JSON（数据模型落盘，可再载入复现） */
  const exportActive = () => {
    if (!activeReport) return
    const name =
      (activeReport.font.postscriptName ?? activeReport.font.family ?? 'coverage')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 60) + '.coverage.json'
    const blob = new Blob([JSON.stringify(activeReport, null, 2) + '\n'], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // 允许再次选择同一文件
    if (files.length === 0) return
    setErr(null)
    for (const f of files) {
      try {
        if (f.name.toLowerCase().endsWith('.json')) {
          const parsed = validateReportFile(JSON.parse(await f.text()))
          if ('error' in parsed) throw new Error(parsed.error)
          appendReports([parsed.report])
        } else {
          const buf = await f.arrayBuffer()
          appendReports(await loadFontReports(buf, setBusy))
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
              <em>{pct(activeModel)}</em>
              <button type="button" onClick={exportActive} aria-label="导出报告 JSON" title="导出当前视图的报告 JSON">
                ⬇ JSON
              </button>
              <button type="button" onClick={clearAll} aria-label="清空">
                ✕
              </button>
            </span>
          )}
          {err && <span className="cov-err">{err}</span>}
          <span className="cov-hint">总体覆盖 = 各字体并集（字体栈语义）· 本地计算，不上传任何数据</span>
        </div>

        {views.length > 0 && (
          <div className="cov-queue" role="tablist" aria-label="字体队列与视图切换">
            {overall && (
              <button
                type="button"
                role="tab"
                aria-selected={activeId === ''}
                className={`cov-qrow cov-qall${activeId === '' ? ' active' : ''}`}
                onClick={() => setActiveId('')}
              >
                <span className="q-label">Σ 合计（{views.length} 款并集）</span>
                <span className="q-pct">{pct(overall)}</span>
              </button>
            )}
            {views.map((v, i) => (
              <div
                key={v.id}
                className={`cov-qrow${activeId === v.id ? ' active' : ''}`}
                role="tab"
                aria-selected={activeId === v.id}
                onClick={() => setActiveId(v.id)}
              >
                <span className="q-label" title={v.model.sublabel}>
                  {v.model.label}
                </span>
                <span className="q-pct">{pct(v.model)}</span>
                {views.length >= 2 && !!marginal[i]?.total && (
                  <span className="q-add" title="按队列顺序并入时，此款字体新增覆盖的缺字数">
                    +{marginal[i].total.toLocaleString()}
                  </span>
                )}
                <button
                  type="button"
                  className="q-remove"
                  aria-label={`移除 ${v.model.label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeEntry(v.id)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {chips.length > 0 && (
          <div className="stat-chips">
            {chips.map((c) => (
              <span className="stat" key={c.label}>
                <b>
                  {c.value}
                  {c.of && <i className="pct-of"> {c.of}</i>}
                </b>
                <i>{c.label}</i>
              </span>
            ))}
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
            {stack.length >= 2 ? '，并对比队列中每款字体各自的覆盖情况' : ''}
            ；<b>点击区块（网格或右侧标签）下钻逐字覆盖地图</b>。
          </p>
          <div className="plane-grid-list">
            {DETAIL_PLANES.map((p) => (
              <CovDetail
                key={p.id}
                plane={p}
                coverage={activeModel}
                stack={stack}
                unionCov={overall}
                onSelectBlock={setDrill}
                selected={drill}
                showTip={showTip}
                onTip={hideTip}
              />
            ))}
          </div>
        </section>

        {drill && activeModel && (
          <section>
            <h2>
              ③ 区块下钻 · {drillBlockZh} <span>1 格 = 1 码位 · 每行 0x100 · 亮 = 覆盖 · 暗纹 = 缺失</span>
            </h2>
            <p className="section-hint">
              {activeModel.label} 在该区块的逐字覆盖地图：亮格 = 已覆盖，暗纹格 = 缺失，
              深缝 = 未分配码位（Scripts.txt 口径不计入分母）。悬停查看单字码位与状态。
            </p>
            <CovBlockDrill
              name={drill}
              coverage={activeModel}
              onClose={() => setDrill(null)}
              showTip={showTip}
              onTip={hideTip}
            />
          </section>
        )}
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
