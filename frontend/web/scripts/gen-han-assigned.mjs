// 从 Unicode 官方 Scripts.txt 生成汉字已分配码位参考标准（src/data/han-assigned.json）
// 用法: node scripts/gen-han-assigned.mjs <Scripts.txt路径> [输出json路径]
// 参考标准供 font-coverage.mjs（CLI）与网页演示页（浏览器端实时计算）共用：
// 分母 = 区块内实际已分配码位（而非区块全长），缺失列表也按实际已分配码位计算，
// 避免把区块内部空隙误报为缺字
// 注意：Script=Han 除 13 个表意区块外还散居部首（U+2E80/2F00）、〇々等符号区，
// 本文件如实按官方区块分组全量收录，展示口径由 font-coverage.mjs 决定
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const [, , inputPath, outputPathArg] = process.argv
if (!inputPath) {
  console.error('usage: node gen-han-assigned.mjs <Scripts.txt> [out.json]')
  process.exit(1)
}
const outputPath = outputPathArg ?? resolve(scriptDir, '../src/data/han-assigned.json')

const lines = readFileSync(inputPath, 'utf8').split('\n')
let version = ''
const hanRanges = [] // [start, end] 闭区间，升序
for (const line of lines) {
  if (!version) {
    const v = line.match(/^# Scripts-(.+)\.txt/)
    if (v) version = v[1]
  }
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*Han\s*#/)
  if (m) {
    const start = parseInt(m[1], 16)
    hanRanges.push([start, parseInt(m[2] ?? m[1], 16)])
  }
}
if (hanRanges.length === 0) {
  console.error('未从 Scripts.txt 解析到任何 Script=Han 条目，请检查文件')
  process.exit(1)
}

// 区块归属：复用 src/data/blocks.json（官方 Blocks.txt 生成，同为 18.0.0 基线）
const blocksFile = JSON.parse(readFileSync(resolve(scriptDir, '../src/data/blocks.json'), 'utf8'))
const blocks = blocksFile.blocks.map((b) => ({
  name: b.name,
  start: parseInt(b.start, 16),
  end: parseInt(b.end, 16),
}))
if (blocksFile.unicodeVersion !== version) {
  console.warn(`⚠️ 版本不一致：blocks.json=${blocksFile.unicodeVersion}，Scripts.txt=${version}`)
}

/** 码位 → 区块下标（二分），空隙返回 -1 */
function blockIndexAt(cp) {
  let lo = 0
  let hi = blocks.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const b = blocks[mid]
    if (cp < b.start) hi = mid - 1
    else if (cp > b.end) lo = mid + 1
    else return mid
  }
  return -1
}

// Han 区间按区块边界切开（Scripts.txt 的连续区间可能跨区块）
const byBlock = new Map() // name -> [start, end][]
let totalAssigned = 0
let outsideBlock = [] // 落在区块空隙的码位（正常不应出现）
for (const [start, end] of hanRanges) {
  for (let cp = start; cp <= end; ) {
    const bi = blockIndexAt(cp)
    if (bi < 0) {
      outsideBlock.push(cp)
      cp++
      continue
    }
    const b = blocks[bi]
    const segEnd = Math.min(end, b.end)
    const list = byBlock.get(b.name) ?? []
    const prev = list[list.length - 1]
    if (prev && prev[1] === cp - 1) prev[1] = segEnd // 相邻区间合并
    else list.push([cp, segEnd])
    byBlock.set(b.name, list)
    totalAssigned += segEnd - cp + 1
    cp = segEnd + 1
  }
}
if (outsideBlock.length > 0) {
  console.error(`⚠️ ${outsideBlock.length} 个 Han 码位落在区块空隙（异常数据）`)
  process.exit(1)
}

const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, '0')
const out = {
  unicodeVersion: version,
  source: `https://www.unicode.org/Public/${version}/ucd/Scripts.txt`,
  script: 'Han',
  totalAssigned,
  blocks: [...byBlock.entries()]
    .sort((a, b) => a[1][0][0] - b[1][0][0])
    .map(([name, ranges]) => ({
      name,
      assigned: ranges.reduce((n, [s, e]) => n + e - s + 1, 0),
      ranges: ranges.map(([s, e]) => [hex(s), hex(e)]),
    })),
}
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${outputPath}`)
console.log(`Script=Han 共 ${totalAssigned.toLocaleString()} 码位，分布于 ${out.blocks.length} 个区块：`)
for (const b of out.blocks) {
  console.log(`  ${b.name}: ${b.assigned.toLocaleString()}`)
}
