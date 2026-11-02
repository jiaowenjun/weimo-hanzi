// 检测字体文件的 Unicode 汉字覆盖度，输出控制台报告 + JSON 报告
// 用法: node scripts/font-coverage.mjs <字体文件...> [--out <目录>] [--reference <han-assigned.json>]
//                                      [--strict] [--missing] [--no-json]
//   --strict   校验命中字形是否为空轮廓（注水字体检测，较慢）
//   --missing  控制台打印每区块完整缺失码位区间（默认只打印数量与示例字）
//   --no-json  不写 JSON 报告，仅控制台输出
// 口径：分母 = Unicode 官方 Scripts.txt 中该区块实际已分配的 Script=Han 码位
//（由 scripts/gen-han-assigned.mjs 生成参考标准），而非区块全长，
// 因此缺失报告不会把区块内部未分配的空隙误报为缺字。
// 主表 = 13 个表意区块（blocks/block-meta 中 category 为 unified/compat 者，码位序）；
// 散居在部首/符号区块的 Han 码位（U+2E80/2F00 等）单独列小计，不计入主覆盖率。
// 依赖 fontkit：支持 ttf/otf/ttc/woff/woff2；ttc 逐成员分析。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, basename, join } from 'node:path'
import { openSync } from 'fontkit'

const scriptDir = dirname(fileURLToPath(import.meta.url))

// —— 展示辅助：中英文对齐（CJK 按 2 列宽估算） ——
const dispW = (s) => [...s].reduce((w, ch) => w + (ch.codePointAt(0) > 0x2e7f ? 2 : 1), 0)
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - dispW(s)))
const padStart = (s, w) => ' '.repeat(Math.max(0, w - dispW(s))) + s
const fmtInt = (n) => n.toLocaleString('en-US')
const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, '0')
const pct = (cov, total) => (total === 0 ? 0 : (100 * cov) / total)

function usage() {
  console.log(
    '用法: node scripts/font-coverage.mjs <字体文件...> [--out <目录>] [--reference <json>]\n' +
      '                                 [--strict] [--missing] [--no-json]',
  )
}

// —— 参数 ——
const fonts = []
const opts = {
  out: resolve(scriptDir, '../reports'),
  reference: resolve(scriptDir, 'data/han-assigned.json'),
  strict: false,
  missing: false,
  json: true,
}
{
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--out') opts.out = args[++i]
    else if (a === '--reference') opts.reference = args[++i]
    else if (a === '--strict') opts.strict = true
    else if (a === '--missing') opts.missing = true
    else if (a === '--no-json') opts.json = false
    else if (a === '-h' || a === '--help') {
      usage()
      process.exit(0)
    } else fonts.push(a)
  }
  if (fonts.length === 0) {
    usage()
    process.exit(1)
  }
}

// —— 参考标准 + 区块表（名称/分类/中文短名挂接自 src/data 三份 JSON） ——
function loadBlockTable() {
  const ref = JSON.parse(readFileSync(opts.reference, 'utf8'))
  const blocksJson = JSON.parse(readFileSync(resolve(scriptDir, '../src/data/blocks.json'), 'utf8'))
  const metaJson = JSON.parse(readFileSync(resolve(scriptDir, '../src/data/block-meta.json'), 'utf8'))
  if (ref.unicodeVersion !== blocksJson.unicodeVersion) {
    console.warn(
      `⚠️ 参考标准版本 ${ref.unicodeVersion} 与 blocks.json ${blocksJson.unicodeVersion} 不一致`,
    )
  }
  const metaByName = new Map(metaJson.blocks.map((b) => [b.name, b]))
  const rangeByName = new Map(blocksJson.blocks.map((b) => [b.name, b]))
  const blocks = ref.blocks.map((rb) => {
    const meta = metaByName.get(rb.name)
    const range = rangeByName.get(rb.name)
    return {
      name: rb.name,
      zh: meta?.short ?? meta?.zh ?? rb.name,
      category: meta?.category ?? 'other',
      start: parseInt(range?.start ?? rb.ranges[0][0], 16),
      end: parseInt(range?.end ?? rb.ranges.at(-1)[1], 16),
      assigned: rb.assigned,
      // 已分配码位区间（数值闭区间，Scripts.txt 真值）
      ranges: rb.ranges.map(([s, e]) => [parseInt(s, 16), parseInt(e, 16)]),
      // 区块全长中扣除已分配后的空隙（用于统计“映射到未分配码位”的注水行为）
      gaps: [],
    }
  })
  for (const b of blocks) {
    let cp = b.start
    for (const [s, e] of b.ranges) {
      if (cp < s) b.gaps.push([cp, s - 1])
      cp = e + 1
    }
    if (cp <= b.end) b.gaps.push([cp, b.end])
  }
  const main = blocks.filter((b) => b.category === 'unified' || b.category === 'compat')
  if (main.length !== 13) {
    console.warn(`⚠️ 主表区块数为 ${main.length}，与预期的 13 个表意区块不符（block-meta 分类数据漂移？）`)
  }
  return { ref, main, scattered: blocks.filter((b) => b.category !== 'unified' && b.category !== 'compat') }
}

const { ref, main, scattered } = loadBlockTable()

/** 在一组闭区间上统计 charset 命中，并交替切分出覆盖/缺失区间 */
function scan(ranges, charset) {
  const coveredRanges = []
  const missingRanges = []
  let covered = 0
  for (const [s, e] of ranges) {
    let runStart = null
    let runCovered = false
    for (let cp = s; cp <= e; cp++) {
      const hit = charset.has(cp)
      if (runStart === null || hit !== runCovered) {
        if (runStart !== null) (runCovered ? coveredRanges : missingRanges).push([runStart, cp - 1])
        runStart = cp
        runCovered = hit
      }
      if (hit) covered++
    }
    if (runStart !== null) (runCovered ? coveredRanges : missingRanges).push([runStart, e])
  }
  return { covered, coveredRanges, missingRanges }
}

function analyzeBlock(block, charset) {
  const { covered, coveredRanges, missingRanges } = scan(block.ranges, charset)
  const gapsHit = []
  for (const [s, e] of block.gaps) {
    for (let cp = s; cp <= e; cp++) if (charset.has(cp)) gapsHit.push(cp)
  }
  return {
    name: block.name,
    zh: block.zh,
    category: block.category,
    start: hex(block.start),
    end: hex(block.end),
    assigned: block.assigned,
    covered,
    coverage: +(covered / block.assigned).toFixed(6),
    missingCount: block.assigned - covered,
    mappedUnassigned: gapsHit.length,
    coveredRanges: coveredRanges.map(([s, e]) => [hex(s), hex(e)]),
    missingRanges: missingRanges.map(([s, e]) => [hex(s), hex(e)]),
  }
}

function subtotal(list) {
  const assigned = list.reduce((n, b) => n + b.assigned, 0)
  const covered = list.reduce((n, b) => n + b.covered, 0)
  return { assigned, covered, coverage: +(covered / assigned).toFixed(6) }
}

// —— 字体文件 sniff（ttc/ttf/otf/woff/woff2） ——
function sniffFormat(path) {
  const fd = readFileSync(path)
  const magic = fd.subarray(0, 4)
  if (magic.equals(Buffer.from('ttcf'))) return 'ttc'
  if (magic.equals(Buffer.from('OTTO'))) return 'otf'
  if (magic.equals(Buffer.from('wOFF'))) return 'woff'
  if (magic.equals(Buffer.from('wOF2'))) return 'woff2'
  if (magic[0] === 0 && magic[1] === 1 && magic[2] === 0 && magic[3] === 0) return 'ttf'
  if (magic.equals(Buffer.from('true'))) return 'ttf'
  return 'unknown'
}

function strictCheck(font, blockResults) {
  let emptyCovered = 0
  const samples = []
  for (const b of blockResults) {
    for (const [lo, hi] of b.coveredRanges) {
      for (let cp = parseInt(lo, 16); cp <= parseInt(hi, 16); cp++) {
        const glyph = font.glyphForCodePoint(cp)
        if (glyph.path.commands.length === 0) {
          emptyCovered++
          if (samples.length < 10) samples.push(hex(cp))
        }
      }
    }
  }
  return { emptyCovered, samples }
}

function analyzeMember(font, fontPath, format, memberIndex, memberCount) {
  const charset = new Set(font.characterSet)
  const blockResults = [...main, ...scattered].map((b) => analyzeBlock(b, charset))
  const mainResults = blockResults.slice(0, main.length)
  const scatteredResults = blockResults.slice(main.length)
  const report = {
    tool: 'weimo-hanzi font-coverage',
    generatedAt: new Date().toISOString(),
    font: {
      path: fontPath,
      format,
      fontNumber: memberCount > 1 ? memberIndex : null,
      family: font.familyName ?? null,
      subfamily: font.subfamilyName ?? null,
      postscriptName: font.postscriptName ?? null,
      charSetSize: charset.size,
    },
    reference: { unicodeVersion: ref.unicodeVersion, source: ref.source, script: ref.script },
    summary: {
      total: subtotal(mainResults),
      unified: subtotal(mainResults.filter((b) => b.category === 'unified')),
      compat: subtotal(mainResults.filter((b) => b.category === 'compat')),
      scattered: subtotal(scatteredResults),
    },
    blocks: mainResults,
    scatteredBlocks: scatteredResults,
    strict: null,
  }
  if (opts.strict) {
    const r = strictCheck(font, blockResults)
    report.strict = { emptyCovered: r.emptyCovered, samples: r.samples }
  }
  return report
}

// —— 控制台输出 ——
function printReport(r) {
  const f = r.font
  const title =
    `${f.family ?? '?'} ${f.subfamily ?? ''}`.trim() +
    `  (${f.postscriptName ?? '?'}${f.fontNumber !== null ? `, ttc#${f.fontNumber}` : ''}, ${f.format}, cmap ${fmtInt(f.charSetSize)} 条)`
  console.log(`\n── ${title}`)
  const nameW = 14
  for (const b of r.blocks) {
    const bar = '█'.repeat(Math.round(pct(b.covered, b.assigned) / 5))
    console.log(
      `${pad(b.zh, nameW)}${padStart(`${fmtInt(b.covered)}/${fmtInt(b.assigned)}`, 16)}${padStart(pct(b.covered, b.assigned).toFixed(1) + '%', 8)}  ${bar}` +
        (b.missingCount > 0 ? `  缺 ${fmtInt(b.missingCount)}` : ''),
    )
    if (b.mappedUnassigned > 0) {
      console.log(`${' '.repeat(nameW)}⚠️ 另有 ${b.mappedUnassigned} 个映射落在区块内未分配码位（不计入覆盖）`)
    }
  }
  const s = r.summary
  console.log(
    `${pad('─ 统一表意小计', nameW)}${padStart(`${fmtInt(s.unified.covered)}/${fmtInt(s.unified.assigned)}`, 16)}${padStart((s.unified.coverage * 100).toFixed(1) + '%', 8)}`,
  )
  console.log(
    `${pad('─ 兼容表意小计', nameW)}${padStart(`${fmtInt(s.compat.covered)}/${fmtInt(s.compat.assigned)}`, 16)}${padStart((s.compat.coverage * 100).toFixed(1) + '%', 8)}`,
  )
  console.log(
    `${pad('＝ 合计（13 区块）', nameW)}${padStart(`${fmtInt(s.total.covered)}/${fmtInt(s.total.assigned)}`, 16)}${padStart((s.total.coverage * 100).toFixed(1) + '%', 8)}`,
  )
  console.log(
    `${pad('＋ 散居 Han（部首/符号）', nameW)}${padStart(`${fmtInt(s.scattered.covered)}/${fmtInt(s.scattered.assigned)}`, 16)}${padStart((s.scattered.coverage * 100).toFixed(1) + '%', 8)}  （不计入主覆盖率）`,
  )
  // 缺失示例
  for (const b of r.blocks) {
    if (b.missingCount === 0) continue
    const sample = [...iterate(b.missingRanges)].slice(0, 12).map((cp) => String.fromCodePoint(cp))
    console.log(`${' '.repeat(nameW)}缺失示例 ${b.zh}: ${sample.join(' ')}${b.missingCount > 12 ? ` …（共 ${fmtInt(b.missingCount)}）` : ''}`)
    if (opts.missing) {
      const ranges = b.missingRanges.map(([lo, hi]) => (lo === hi ? hex(parseInt(lo, 16)) : `U+${lo}..${hi}`)).join(' ')
      console.log(`${' '.repeat(nameW)}缺失区间 ${b.zh}: ${ranges}`)
    }
  }
  if (r.strict && r.strict.emptyCovered > 0) {
    console.log(`⚠️ --strict：${fmtInt(r.strict.emptyCovered)} 个命中码位字形为空轮廓（注水嫌疑），如 ${r.strict.samples.join(' ')}`)
  } else if (r.strict) {
    console.log('--strict：命中字形均为非空轮廓')
  }
}

/** 区间数组（hex 字符串对）→ 码位迭代器 */
function* iterate(ranges) {
  for (const [lo, hi] of ranges) {
    for (let cp = parseInt(lo, 16); cp <= parseInt(hi, 16); cp++) yield cp
  }
}

function printCompare(reports) {
  if (reports.length < 2) return
  const nameW = 16
  const colW = 12
  const heads = reports.map((r) => {
    const h = `${r.font.family ?? basename(r.font.path, '.ttf')}${r.font.fontNumber !== null ? `#${r.font.fontNumber}` : ''}`
    return dispW(h) > colW - 1 ? [...h].slice(0, colW - 1).join('') + '…' : h
  })
  console.log(`\n══ 字体覆盖对比（Unicode ${ref.unicodeVersion}，Han 13 区块）`)
  console.log(pad('区块', nameW) + heads.map((h) => padStart(h, colW)).join(''))
  const rows = [
    ...reports[0].blocks.map((b) => ({ label: b.zh, get: (r) => r.blocks.find((x) => x.name === b.name) })),
    { label: '＝ 合计', get: (r) => r.summary.total },
    { label: '＋ 散居 Han', get: (r) => r.summary.scattered },
  ]
  for (const row of rows) {
    const cells = reports.map((r) => {
      const b = row.get(r)
      return padStart((pct(b.covered, b.assigned)).toFixed(1) + '%', colW)
    })
    console.log(pad(row.label, nameW) + cells.join(''))
  }
}

// —— 主流程 ——
const reports = []
let failed = 0
for (const fontPath of fonts) {
  let opened
  try {
    opened = openSync(fontPath)
  } catch (e) {
    console.error(`✗ 无法解析 ${fontPath}: ${e.message}`)
    failed++
    continue
  }
  const members = opened.fonts ?? [opened]
  const format = sniffFormat(fontPath)
  members.forEach((font, i) => {
    const r = analyzeMember(font, fontPath, format, i, members.length)
    reports.push(r)
    printReport(r)
  })
}
printCompare(reports)

if (opts.json && reports.length > 0) {
  mkdirSync(opts.out, { recursive: true })
  for (const r of reports) {
    const stem = basename(r.font.path).replace(/\.[^.]+$/, '').replace(/\s+/g, '_')
    const suffix = r.font.fontNumber !== null ? `-${r.font.fontNumber}` : ''
    const file = join(opts.out, `${stem}${suffix}.coverage.json`)
    writeFileSync(file, JSON.stringify(r, null, 2) + '\n')
    console.log(`\nJSON 报告: ${file}`)
  }
}
process.exit(failed > 0 ? 1 : 0)
