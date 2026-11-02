// 缺失标示共用的 45° 无缝斜纹图案（canvas pattern）：
// 8×8 tile 上两条斜线（x+y=4 与 x+y=12，周期 8），叠在暗罩上形成「缺失」警示质感。
// 全景（1px=1 码位）与详图（512px 画布）共用同一比例，视觉密度一致
export function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas')
  tile.width = tile.height = 8
  const tctx = tile.getContext('2d')
  if (!tctx) return null
  tctx.strokeStyle = 'rgba(227, 231, 240, 0.22)'
  tctx.lineWidth = 1
  tctx.beginPath()
  tctx.moveTo(-2, 6)
  tctx.lineTo(6, -2)
  tctx.moveTo(2, 10)
  tctx.lineTo(10, 2)
  tctx.stroke()
  return ctx.createPattern(tile, 'repeat')
}
