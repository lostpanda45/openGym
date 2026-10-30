import { describe, expect, it } from 'vitest'
import { trendPoints, trendChange } from './measurement-trend.js'

const DAY = 86400000
const at = d => Date.parse(d + 'T12:00:00Z')

describe('measurement trend', () => {
  it('returns no trend for fewer than two points', () => {
    expect(trendPoints([])).toEqual([])
    expect(trendPoints([{ t: at('2026-01-01'), y: 80 }])).toEqual([])
    expect(trendChange([{ t: at('2026-01-01'), y: 80 }])).toBeNull()
  })

  it('follows a straight line exactly', () => {
    const pts = [0, 7, 14, 21].map(d => ({ t: at('2026-01-01') + d * DAY, y: 80 + d * 0.5 }))
    const trend = trendPoints(pts)
    expect(trend.length).toBeGreaterThan(1)
    for (const p of trend) {
      const days = (p.t - at('2026-01-01')) / DAY
      expect(p.y).toBeCloseTo(80 + days * 0.5, 5)
    }
  })

  it('reads the change over the last four weeks, not since the previous point', () => {
    // Flat for months, then a real move in the final fortnight: the last-two-point delta would
    // double-count it; the fitted 4-week change reports the move that actually happened.
    const xs = [0, 14, 28, 42, 56, 70, 84]
    const pts = xs.map((d, i) => ({ t: at('2026-01-01') + d * DAY, y: i < 5 ? 90 : 88 }))
    const ch = trendChange(pts)
    expect(ch.delta).toBeLessThan(0)
    expect(Math.abs(ch.delta)).toBeLessThan(2 + 1e-6)   // a 2 cm step, not a spurious 4
  })

  it('is not dragged by one bad reading', () => {
    const xs = [0, 7, 14, 21, 28, 35, 42]
    const base = xs.map(d => ({ t: at('2026-01-01') + d * DAY, y: 100 }))
    const spike = base.map((p, i) => i === 3 ? { ...p, y: 130 } : p)   // one 30 cm tape error
    const a = trendChange(base), b = trendChange(spike)
    expect(Math.abs(b.latest - 100)).toBeLessThan(1e-6)
    expect(Math.abs(b.delta - a.delta)).toBeLessThan(2)                 // the spike barely moves it
  })

  it('keeps the trend within the data when a bandwidth spans a long gap', () => {
    const pts = [
      { t: at('2025-01-01'), y: 80 },
      { t: at('2025-06-01'), y: 84 },
      { t: at('2026-01-01'), y: 88 },
    ]
    for (const p of trendPoints(pts)) {
      expect(p.y).toBeGreaterThanOrEqual(79)
      expect(p.y).toBeLessThanOrEqual(89)
    }
  })
})
