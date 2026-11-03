// 文本缺字检测页（/check.html）—— 纯 View 层（P2）。
// 数据链路与覆盖页同构（MV）：字体文件/报告 JSON → CoverageReportFile →
// 组装层 assembleViewModel（多字体自动并集）→ checkText 纯函数 → 本组件渲染。
// 只检测 Script=Han 字符；未分配汉字单列；缺字给内置开源字体救援建议
import { useMemo, useState } from 'react'
import {
  assembleViewModel,
  type CoverageModel,
} from '../coverage/lib/coverage'
import { validateReportFile, type CoverageReportFile } from '../coverage/lib/report'
import { loadFontReports } from '../coverage/lib/fontLoad'
import { unionReports } from '../coverage/lib/union'
import { rescueAdvice } from '../coverage/lib/rescue'
import { checkText, statsToRanges } from './lib/textCheck'

const SAMPLE =
  '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。\n生僻字示例：㵘䲜𪚥𠈌𪚀𰁜𱁬。\n覆盖盲区常见于扩展 B：𠀀𠀁𠀂 𪚥。'

interface QueueEntry {
  id: string
  report: CoverageReportFile
}

let uid = 0
const nextId = () => `t${++uid}-${Date.now().toString(36)}`

export default function CheckDemo() {
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /** 总体恒为并集（≥2 款时）—— 文本检测关心「这套组合能不能排」 */
  const model: CoverageModel | null = useMemo(() => {
    if (queue.length === 0) return null
    const reports = queue.map((q) => q.report)
    return assembleViewModel(reports.length >= 2 ? unionReports(reports) : reports[0])
  }, [queue])

  const result = useMemo(() => (model ? checkText(text, model) : null), [text, model])

  const advice = useMemo(
    () => (result && result.missing.length > 0 ? rescueAdvice(statsToRanges(result.missing)) : []),
    [result],
  )

  const fontLabel = model?.label ?? '未选择'

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setErr(null)
    for (const f of files) {
      try {
        if (f.name.toLowerCase().endsWith('.json')) {
          const parsed = validateReportFile(JSON.parse(await f.text()))
          if ('error' in parsed) throw new Error(parsed.error)
          setQueue((prev) => [...prev, { id: nextId(), report: parsed.report }])
        } else {
          const buf = await f.arrayBuffer()
          const loaded = await loadFontReports(buf, setBusy)
          setQueue((prev) => [...prev, ...loaded.map((r) => ({ id: nextId(), report: r }))])
        }
      } catch (ex) {
        setErr(`${f.name}：${ex instanceof Error ? ex.message : String(ex)}`)
      } finally {
        setBusy(null)
      }
    }
  }

  const copyMissing = async () => {
    if (!result || result.missing.length === 0) return
    await navigator.clipboard.writeText(result.missing.map((m) => m.char).join(''))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">weimo-hanzi · 文本缺字检测</p>
        <h1>这段文字，你的字体缺哪些字？</h1>
        <p className="sub">
          选择字体文件（可多选，总体 = 并集）或 font-coverage 报告 JSON，粘贴文本，
          即时列出当前字体组合排不了的字 —— 全程本地计算，不上传任何数据。
          检测口径为 Script=Han（覆盖报告仅含汉字区块）。
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
          {!busy && model && (
            <span className="cov-chip" title={model.sublabel}>
              <b>{fontLabel}</b>
              <i>{model.sublabel}</i>
              <em>{(model.summary.total.coverage * 100).toFixed(1)}%</em>
              <button
                type="button"
                onClick={() => setQueue([])}
                aria-label="清空"
              >
                ✕
              </button>
            </span>
          )}
          {err && <span className="cov-err">{err}</span>}
        </div>

        <textarea
          className="tc-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴要检测的文本…（只检测汉字字符）"
          rows={6}
        />
        <div className="tc-actions">
          <button type="button" className="tc-btn" onClick={() => setText(SAMPLE)}>
            填入示例文本
          </button>
          <button type="button" className="tc-btn" onClick={() => setText('')}>
            清空文本
          </button>
        </div>
      </header>

      <main>
        {!model && (
          <p className="tc-empty">先选择字体文件或报告 JSON，再粘贴文本 —— 缺字清单会即时出现在这里。</p>
        )}
        {model && !text.trim() && <p className="tc-empty">字体已就绪（{fontLabel}），粘贴文本开始检测。</p>}

        {model && result && text.trim() && (
          <section>
            <h2>
              检测结果 <span>{fontLabel} · 并集口径</span>
            </h2>
            <div className="stat-chips">
              <span className="stat">
                <b>{result.total.toLocaleString()}</b>
                <i>文本字符</i>
              </span>
              <span className="stat">
                <b>{result.uniqueHan.toLocaleString()}</b>
                <i>去重汉字</i>
              </span>
              <span className="stat">
                <b>
                  {result.coveredUnique.toLocaleString()}
                  <i className="pct-of"> / {result.uniqueHan.toLocaleString()}</i>
                </b>
                <i>文本覆盖</i>
              </span>
              <span className={`stat${result.missing.length === 0 ? ' tc-ok' : ''}`}>
                <b>{result.missing.length.toLocaleString()}</b>
                <i>缺字</i>
              </span>
            </div>

            {result.missing.length === 0 && (
              <p className="tc-ok-line">✓ 当前字体组合可完整排出这段文字。</p>
            )}

            {result.missing.length > 0 && (
              <>
                <div className="tc-miss-head">
                  <span>缺失清单（按出现频次降序）</span>
                  <button type="button" className="tc-btn" onClick={copyMissing}>
                    {copied ? '已复制 ✓' : '复制缺字'}
                  </button>
                </div>
                <table className="tc-table">
                  <thead>
                    <tr>
                      <th>字</th>
                      <th>码位</th>
                      <th>次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.missing.slice(0, 200).map((m) => (
                      <tr key={m.cp}>
                        <td className="tc-char">{m.char}</td>
                        <td className="tc-cp">U+{m.cp.toString(16).toUpperCase().padStart(4, '0')}</td>
                        <td>{m.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.missing.length > 200 && (
                  <p className="tc-more">仅显示前 200 字，共 {result.missing.length.toLocaleString()} 字（可复制完整清单）</p>
                )}
                {advice.length > 0 && (
                  <p className="cs-advice">
                    救援建议：
                    {advice.map((a) => (
                      <span key={a.id}>
                        <a href={a.url} target="_blank" rel="noreferrer">
                          {a.label}
                        </a>{' '}
                        可补 {a.count.toLocaleString()} 字
                      </span>
                    ))}
                    （开源字体，点字体名可获取字体文件并入字体栈）
                  </p>
                )}
              </>
            )}

            {result.unassigned.length > 0 && (
              <>
                <div className="tc-miss-head">
                  <span>未编码 / 不在 Scripts.txt 已分配区间（任何受测字体必缺）</span>
                </div>
                <p className="tc-chars">{result.unassigned.map((u) => u.char).join('')}</p>
              </>
            )}
          </section>
        )}
      </main>

      <footer>
        <p>
          覆盖口径与热力图页一致：Unicode Scripts.txt 已分配的 Script=Han 码位；
          总体覆盖 = 各字体 cmap 并集。救援知识库为内置开源字体的覆盖区间统计（非字体文件）。
        </p>
        <p className="sources">
          <a href="/">← 主全景页</a> · <a href="/coverage.html">← 覆盖热力图</a> ·{' '}
          <a
            href="https://github.com/jiaowenjun/weimo-hanzi/blob/main/docs/research/2026-11-02-unicode-han-blocks.md"
            target="_blank"
            rel="noreferrer"
          >
            调研报告
          </a>
        </p>
      </footer>
    </div>
  )
}
