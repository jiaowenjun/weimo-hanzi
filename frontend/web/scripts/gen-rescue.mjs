// 生成缺字救援知识库 src/data/rescue.json（P2）
// 用法: node scripts/gen-rescue.mjs <字体文件...> --out <rescue.json路径>
// 前置：对每款开源字体先跑 pnpm coverage 得到 .coverage.json，
//   或直接传字体文件由本脚本调用 font-coverage.mjs 逻辑（本脚本直接消费报告 JSON）
// 收录原则：仅收录可自由再分发覆盖统计的开源字体（OFL 等）；
// rescue.json 只含覆盖区间统计（非字体文件），作为静态数据随构建分发
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
if (outIdx === -1 || outIdx === 0 || args.length < 3) {
  console.error('usage: node gen-rescue.mjs <report.coverage.json ...> --out <out.json>')
  process.exit(1)
}
const inputs = args.slice(0, outIdx)
const outputPath = args[outIdx + 1]

const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, '0')

/** 官方下载页（用户自取字体文件并入字体栈） */
const META = {
  'NotoSansSC-Regular': {
    id: 'noto-sans-sc',
    label: 'Noto Sans SC',
    license: 'SIL Open Font License 1.1',
    url: 'https://github.com/notofonts/noto-cjk/tree/main/Sans/SubsetOTF/SC',
  },
  'NotoSerifSC-Regular': {
    id: 'noto-serif-sc',
    label: 'Noto Serif SC',
    license: 'SIL Open Font License 1.1',
    url: 'https://github.com/notofonts/noto-cjk/tree/main/Serif/SubsetOTF/SC',
  },
}

const fonts = []
for (const p of inputs) {
  const report = JSON.parse(readFileSync(p, 'utf8'))
  const psName = report.font.postscriptName ?? report.font.family ?? ''
  const meta = META[psName]
  if (!meta) throw new Error(`未登记的救援字体：${psName}（请在脚本 META 中补充条目）`)

  // 各区块 coveredRanges 合并为全局升序区间
  const ranges = [...report.blocks, ...report.scatteredBlocks]
    .flatMap((b) => b.coveredRanges.map(([s, e]) => [parseInt(s, 16), parseInt(e, 16)]))
    .sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [s, e] of ranges) {
    const last = merged.at(-1)
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  const covered = merged.reduce((n, [s, e]) => n + e - s + 1, 0)
  fonts.push({
    id: meta.id,
    label: meta.label,
    license: meta.license,
    url: meta.url,
    coveredRanges: merged.map(([s, e]) => [hex(s), hex(e)]),
  })
  console.log(`${meta.label}: 覆盖 ${covered.toLocaleString()} 字 / ${merged.length} 段区间`)
}

const out = { generatedAt: new Date().toISOString().slice(0, 10), fonts }
writeFileSync(outputPath, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${outputPath}`)
