import { describe, expect, it } from 'vitest'
import { ratioRows, verdict, GOOD_DIR } from './physique-ratios.js'

const e = (d, o) => ({ d, ...o })

describe('physique ratios', () => {
  it('reads a verdict only outside the noise band', () => {
    expect(verdict(0.2, GOOD_DIR.waist, 0.5)).toBeNull()   // inside tolerance
    expect(verdict(-1.2, GOOD_DIR.waist, 0.5)).toBe('good') // waist down
    expect(verdict(1.2, GOOD_DIR.waist, 0.5)).toBe('bad')   // waist up
    expect(verdict(1.2, GOOD_DIR.shoulders, 0.5)).toBe('good')
    expect(verdict(1.2, GOOD_DIR.wristLeft, 0.5)).toBeNull() // neutral field
    expect(verdict(null, GOOD_DIR.waist)).toBeNull()
  })

  it('pairs both sides on the same check-in and ignores days missing one', () => {
    const rows = ratioRows([
      e('2026-01-01', { shoulders: 116, waist: 88 }),   // 1.318
      e('2026-01-15', { shoulders: 117 }),              // no waist: dropped
      e('2026-02-01', { shoulders: 118, waist: 86 }),   // 1.372
      e('2026-03-01', { shoulders: 119, waist: 84 }),   // 1.417
    ])
    const v = rows.find(r => r.id === 'vtaper')
    expect(v).toBeTruthy()
    expect(v.value).toBeCloseTo(119 / 84, 5)
    expect(v.move).toBe('good')                          // shoulders up while waist down
  })

  it('calls a rising hip-to-waist ratio bad', () => {
    const rows = ratioRows([
      e('2026-01-01', { hips: 90, waist: 88 }),
      e('2026-02-01', { hips: 92, waist: 86 }),
      e('2026-03-01', { hips: 94, waist: 84 }),
    ])
    const hip = rows.find(r => r.id === 'hip')
    expect(hip).toBeTruthy()
    expect(hip.move).toBe('bad')
  })

  it('drops a ratio that has fewer than two paired readings', () => {
    const rows = ratioRows([e('2026-01-01', { chest: 104, waist: 86 })])
    expect(rows.some(r => r.id === 'chest')).toBe(false)
  })

  it('states the direction it judges against', () => {
    expect(GOOD_DIR.waist).toBe(-1)
    expect(GOOD_DIR.shoulders).toBe(1)
    expect(GOOD_DIR.wristLeft).toBe(0)
  })
})
