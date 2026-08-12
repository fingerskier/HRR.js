import { describe, it, expect } from 'vitest'
import { magnitudeToColor, phaseToColor, similarityToColor } from '../src/viz/color.js'

describe('phaseToColor', () => {
  it('wraps: phase 0 and phase 2π are the same color', () => {
    expect(phaseToColor(0)).toBe(phaseToColor(2 * Math.PI))
  })

  it('separates opposite phases', () => {
    expect(phaseToColor(0)).not.toBe(phaseToColor(Math.PI))
  })

  it('returns a CSS color string', () => {
    expect(phaseToColor(1)).toMatch(/^hsl\(/)
  })
})

describe('similarityToColor', () => {
  it('is neutral at zero and saturated at the extremes', () => {
    expect(similarityToColor(0)).not.toBe(similarityToColor(1))
    expect(similarityToColor(1)).not.toBe(similarityToColor(-1))
  })

  it('clamps out-of-range input instead of producing nonsense', () => {
    expect(similarityToColor(5)).toBe(similarityToColor(1))
    expect(similarityToColor(-5)).toBe(similarityToColor(-1))
  })
})

describe('magnitudeToColor', () => {
  it('maps zero to black and the max to white', () => {
    expect(magnitudeToColor(0, 4)).toBe('rgb(0, 0, 0)')
    expect(magnitudeToColor(4, 4)).toBe('rgb(255, 255, 255)')
  })

  it('treats a zero max as fully dark rather than dividing by zero', () => {
    expect(magnitudeToColor(0, 0)).toBe('rgb(0, 0, 0)')
  })
})
