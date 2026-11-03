// 预设字符集口径卡片（P2 View）：每套字表按当前覆盖视图统计
// 覆盖 x/y + 百分比条 + 缺字展开预览；救援建议（缺字可被哪款内置字体补）由 lib/rescue 挂接
import { useMemo, useState } from 'react'
import { CHARSETS, charsetCoverage } from './lib/charsets'
import { rescueAdvice } from './lib/rescue'
import type { CoverageModel } from './lib/coverage'

interface Props {
  coverage: CoverageModel
}

const PREVIEW = 300

export default function CovCharsets({ coverage }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(
    () => CHARSETS.map((set) => ({ set, cov: charsetCoverage(set, coverage) })),
    [coverage],
  )

  return (
    <div className="cs-list">
      {rows.map(({ set, cov }) => {
        const missing = cov.total - cov.covered
        const advice = missing > 0 ? rescueAdvice(cov.missingRanges) : []
        const isOpen = open === set.id
        return (
          <div key={set.id} className="cs-card">
            <div className="cs-head">
              <b>{set.label}</b>
              <span className="cs-meta">{set.meta}</span>
              <span className="cs-bar" title={`覆盖 ${cov.covered.toLocaleString()} / ${cov.total.toLocaleString()}`}>
                <i style={{ width: `${(cov.coverage * 100).toFixed(1)}%` }} />
              </span>
              <span className="cs-pct">{(cov.coverage * 100).toFixed(2)}%</span>
              <span className="cs-sub">
                {cov.covered.toLocaleString()} / {cov.total.toLocaleString()}
              </span>
              {missing > 0 ? (
                <button type="button" className="cs-toggle" onClick={() => setOpen(isOpen ? null : set.id)}>
                  缺 {missing.toLocaleString()} 字 {isOpen ? '▴' : '▾'}
                </button>
              ) : (
                <span className="cs-full">全覆盖 ✓</span>
              )}
            </div>
            {isOpen && missing > 0 && (
              <div className="cs-body">
                <p className="cs-chars" aria-label={`${set.label}缺失字符`}>
                  {cov.missingChars.slice(0, PREVIEW).join('')}
                  {cov.missingChars.length > PREVIEW && (
                    <span className="cs-more"> …（共 {missing.toLocaleString()} 字，前 {PREVIEW} 字）</span>
                  )}
                </p>
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
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
