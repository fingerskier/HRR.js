const TWO_PI = 2 * Math.PI

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/**
 * Phase to a cyclic hue. Cyclic hue is the only honest mapping for an angle —
 * it wraps where the data wraps — but it is poor for colorblind viewers, so
 * every panel that uses it also prints numbers.
 */
export function phaseToColor(phase: number): string {
  const wrapped = ((phase % TWO_PI) + TWO_PI) % TWO_PI
  const hue = (wrapped / TWO_PI) * 360
  return `hsl(${hue.toFixed(1)}, 70%, 55%)`
}

/** Similarity to a diverging ramp: blue at -1, near-black at 0, red at +1. */
export function similarityToColor(s: number): string {
  const v = clamp(s, -1, 1)
  const strength = Math.abs(v)
  const hue = v >= 0 ? 12 : 220
  const lightness = 12 + strength * 48
  return `hsl(${hue}, ${(strength * 80).toFixed(1)}%, ${lightness.toFixed(1)}%)`
}

/** Consensus magnitude to grayscale, black at 0 and white at `max`. */
export function magnitudeToColor(m: number, max: number): string {
  const t = max <= 0 ? 0 : clamp(m / max, 0, 1)
  const level = Math.round(t * 255)
  return `rgb(${level}, ${level}, ${level})`
}
