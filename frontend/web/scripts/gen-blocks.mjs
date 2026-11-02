// 从 Unicode 官方 Blocks.txt 生成 JSON 数据文件（src/data/blocks.json）
// 用法: node scripts/gen-blocks.mjs <Blocks.txt路径> <输出json路径>
// 输出仅含码位范围与官方区块名；分类与中文详情由 block-meta.json 按名挂接
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('usage: node gen-blocks.mjs <Blocks.txt> <out.json>')
  process.exit(1)
}

const lines = readFileSync(inputPath, 'utf8').split('\n')
const blocks = []
let version = ''
for (const line of lines) {
  const m = line.match(/^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+)$/)
  if (m) {
    blocks.push({
      start: m[1].padStart(4, '0'),
      end: m[2].padStart(4, '0'),
      name: m[3].trim(),
    })
  }
  if (!version) {
    const v = line.match(/^# Blocks-(.+)\.txt/)
    if (v) version = v[1]
  }
}

const out = {
  unicodeVersion: version,
  source: `https://www.unicode.org/Public/${version}/ucd/Blocks.txt`,
  blocks,
}
writeFileSync(outputPath, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${outputPath}: ${blocks.length} blocks (Unicode ${version})`)
