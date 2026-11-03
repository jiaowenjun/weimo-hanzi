// 生成预设字符集数据 src/data/charsets.json（P2：字表口径统计的单一数据源）
// 用法: node scripts/gen-charsets.mjs <通用规范汉字表characters.txt> <输出json路径>
// 输入取 jaywcjlove/table-of-general-standard-chinese-characters 的
// data/characters.txt（8105 字，行序 = 一/二/三级字表顺序）：
//   curl -sL https://raw.githubusercontent.com/jaywcjlove/table-of-general-standard-chinese-characters/HEAD/data/characters.txt
// GB2312 汉字无需外部数据：EUC-CN 0xB0A1–0xF7FE 全枚举解码（算法即真值）
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('usage: node gen-charsets.mjs <characters.txt> <out.json>')
  process.exit(1)
}

// —— 通用规范汉字表（2013）：8105 字；前 3500 = 一级字表（常用）——
const src = readFileSync(inputPath, 'utf8')
const chars = [...src].filter((c) => !/\s/.test(c))
if (chars.length !== 8105) throw new Error(`通规字数 ${chars.length} ≠ 8105`)
if (new Set(chars).size !== 8105) throw new Error('通规存在重复字')

// —— GB2312 汉字：EUC-CN 汉字区全枚举（一级 3755 + 二级 3008 = 6763）——
const dec = new TextDecoder('gbk')
const gb = []
for (let hi = 0xb0; hi <= 0xf7; hi++) {
  for (let lo = 0xa1; lo <= 0xfe; lo++) {
    let s = ''
    try {
      s = dec.decode(new Uint8Array([hi, lo]))
    } catch {
      continue
    }
    if (s.length !== 1) continue
    const cp = s.codePointAt(0)
    if (cp >= 0x4e00 && cp <= 0x9fff) gb.push(cp)
  }
}
if (gb.length !== 6763) throw new Error(`GB2312 字数 ${gb.length} ≠ 6763`)
if (new Set(gb).size !== 6763) throw new Error('GB2312 存在重复字')

const TG_SOURCE =
  'https://github.com/jaywcjlove/table-of-general-standard-chinese-characters (data/characters.txt)'

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  // 碎散字表用连续字符串存储（远小于区间对）；一级 3500 从属通规前缀派生，不重复存
  sets: [
    {
      id: 'tonggui',
      label: '通用规范汉字表',
      meta: '国务院 2013 年公布 · 8105 字（一/二/三级）',
      source: TG_SOURCE,
      chars: chars.join(''),
    },
    {
      id: 'tonggui-1',
      label: '通用规范汉字表 · 一级',
      meta: '常用字 3500（字表顺序前 3500）',
      source: TG_SOURCE,
      from: 'tonggui',
      first: 3500,
    },
    {
      id: 'gb2312',
      label: 'GB2312 汉字',
      meta: '1980 · 一级 3755 + 二级 3008 = 6763 字',
      source: '算法枚举 EUC-CN 0xB0A1–0xF7FE（本脚本生成，无外部数据）',
      chars: String.fromCodePoint(...gb),
    },
  ],
}
writeFileSync(outputPath, JSON.stringify(out, null, 2) + '\n')
console.log(
  `wrote ${outputPath}: ` +
    out.sets.map((s) => `${s.label}${s.chars ? [...s.chars].length : s.first} 字`).join('，'),
)
