/**
 * Size a canvas to its CSS width and the given height, accounting for device
 * pixel ratio, then return a context scaled so drawing code can work in CSS
 * pixels. Also clears whatever was there.
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  cssHeight: number,
): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1
  const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 600

  canvas.width = Math.max(1, Math.round(cssWidth * ratio))
  canvas.height = Math.max(1, Math.round(cssHeight * ratio))
  canvas.style.height = `${cssHeight}px`

  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('2D canvas context unavailable')

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  return ctx
}

/** The CSS-pixel width a `fitCanvas` context draws into. */
export const cssWidth = (canvas: HTMLCanvasElement): number =>
  canvas.clientWidth || canvas.parentElement?.clientWidth || 600

/**
 * Run `fn` at most once per animation frame, however many events arrive.
 * Resize fires dozens of times a second during a drag, and every panel here
 * redraws canvases — some rebuild DOM — on each one.
 */
export function onResize(fn: () => void): void {
  let frame: number | null = null
  window.addEventListener('resize', () => {
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      fn()
    })
  })
}
