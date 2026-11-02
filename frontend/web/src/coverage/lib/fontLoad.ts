// 浏览器端字体加载：fontkit 动态 import（独立 chunk，选字体文件时才加载）
// 支持 ttf/otf/ttc/woff/woff2；ttc 逐成员解析，返回每个成员的字符集与元信息
import { computeCoverage, type FontMemberInfo } from './compute'
import type { CoverageModel } from './coverage'

/** 魔数嗅探字体容器格式（与 CLI font-coverage.mjs 同款判定） */
function sniffFormat(b: ArrayBuffer): string {
  const m = new Uint8Array(b, 0, 4)
  const tag = String.fromCharCode(...m)
  if (tag === 'ttcf') return 'ttc'
  if (tag === 'OTTO') return 'otf'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'wOF2') return 'woff2'
  if (m[0] === 0 && m[1] === 1 && m[2] === 0 && m[3] === 0) return 'ttf'
  if (tag === 'true') return 'ttf'
  return 'unknown'
}

/** fontkit 字体对象的最小接口（避免依赖其类型声明细节） */
interface FontLike {
  characterSet: number[]
  familyName?: string | null
  subfamilyName?: string | null
  postscriptName?: string | null
}

interface FontkitModule {
  /** fontkit 浏览器端要求字节视图（内部 new DataView(bytes.buffer)），裸 ArrayBuffer 会抛错 */
  create(bytes: Uint8Array): FontLike | { fonts: FontLike[] }
}

/** 解析字体文件 → 每个成员（ttc 可多成员）的 CoverageModel。
 *  数据量大（cmap 上万条 + 全量 Han 区间扫描），用微任务分片让出主线程，避免卡住 UI */
export async function loadFontCoverage(
  buffer: ArrayBuffer,
  onProgress?: (msg: string) => void,
): Promise<CoverageModel[]> {
  onProgress?.('加载解析引擎…')
  const fontkit = (await import('fontkit')) as unknown as FontkitModule
  const format = sniffFormat(buffer)
  if (format === 'unknown') throw new Error('无法识别的字体文件（支持 ttf/otf/ttc/woff/woff2）')
  onProgress?.(`解析字体（${format}）…`)
  const opened = fontkit.create(new Uint8Array(buffer))
  const members = 'fonts' in opened ? opened.fonts : [opened]
  const models: CoverageModel[] = []
  for (let i = 0; i < members.length; i++) {
    const font = members[i]
    onProgress?.(
      members.length > 1 ? `分析成员 ${i + 1}/${members.length}（${font.familyName ?? '?'}）…` : '计算汉字覆盖…',
    )
    await new Promise((r) => setTimeout(r, 0)) // 让出主线程，进度文案有机会渲染
    const charset = new Set(font.characterSet)
    const family = font.familyName ?? null
    const subfamily = font.subfamilyName ?? null
    const psName = font.postscriptName ?? null
    const info: FontMemberInfo = {
      label: [family, subfamily].filter(Boolean).join(' ') || psName || '未知字体',
      sublabel: [psName, format, `cmap ${charset.size.toLocaleString()} 条`]
        .filter(Boolean)
        .join(' · '),
      family,
      subfamily,
      format,
    }
    models.push(computeCoverage(charset, info))
  }
  return models
}
