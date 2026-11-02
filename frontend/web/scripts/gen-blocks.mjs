// 从 Unicode 官方 Blocks.txt 生成 TS 数据文件
// 用法: node scripts/gen-blocks.mjs <Blocks.txt路径> <输出ts路径>
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('usage: node gen-blocks.mjs <Blocks.txt> <out.ts>')
  process.exit(1)
}

const lines = readFileSync(inputPath, 'utf8').split('\n')
const blocks = []
let version = ''
for (const line of lines) {
  const m = line.match(/^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+)$/)
  if (m) {
    blocks.push([parseInt(m[1], 16), parseInt(m[2], 16), m[3].trim()])
  }
  if (!version) {
    const v = line.match(/^# Blocks-(.+)\.txt/)
    if (v) version = v[1]
  }
}

const body = blocks
  .map(([s, e, n]) => `  [0x${s.toString(16).toUpperCase()}, 0x${e.toString(16).toUpperCase()}, ${JSON.stringify(n)}],`)
  .join('\n')

const out = `// 由 scripts/gen-blocks.mjs 从 Unicode 官方 Blocks.txt 生成，勿手改
// 版本: Unicode ${version}，区块总数: ${blocks.length}
// 数据源: https://www.unicode.org/Public/${version}/ucd/Blocks.txt
export type RawBlock = readonly [start: number, end: number, name: string]

export const UNICODE_VERSION = '${version}'

export const unicodeBlocks: readonly RawBlock[] = [
${body}
]
`
writeFileSync(outputPath, out)
console.log(`wrote ${outputPath}: ${blocks.length} blocks (Unicode ${version})`)
