// Physique ratios and "is this moving the right way?" — the reading a tape cannot give on its
// own. Every value is derived from the stored check-ins at render time, so a new entry is in it
// immediately. Ratios need both sides on the SAME check-in, so they are taken from paired
// readings only, never by mixing a waist from one day with shoulders from another.
//
// `good` is the direction that improves a lean physique: +1 more is better, -1 less is better,
// 0 neutral (a wrist is a frame measurement, not a goal). This is a stated default, not a law —
// it is what the panel is judging against.

import { trendChange } from './measurement-trend.js'

export const GOOD_DIR = {
  waist: -1, abdomen: -1, hips: -1, bodyFat: -1, fat_mass: -1, visceral_fat: -1, metabolic_age: -1,
  chest: 1, shoulders: 1, upperArmLeft: 1, upperArmRight: 1, thighLeft: 1, thighRight: 1,
  muscle_mass: 1, boditrax_score: 1, bicep_relaxed: 1,
  calfLeft: 0, calfRight: 0, neck: 0, forearmLeft: 0, forearmRight: 0,
  wristLeft: 0, wristRight: 0, ankleLeft: 0, ankleRight: 0,
}

// The ratios that describe a V-taper physique, heaviest signal first. Labels are the field
// labels the app already translates, so the panel adds no new strings.
export const RATIOS = [
  { id: 'vtaper', num: 'shoulders', den: 'waist', numLabel: 'Shoulders', denLabel: 'Waist', good: 1 },
  { id: 'chest', num: 'chest', den: 'waist', numLabel: 'Chest', denLabel: 'Waist', good: 1 },
  { id: 'hip', num: 'hips', den: 'waist', numLabel: 'Hips', denLabel: 'Waist', good: -1 },
  { id: 'arm', num: 'upperArmLeft', den: 'waist', numLabel: 'Left upper arm', denLabel: 'Waist', good: 1 },
]

/**
 * 'good' | 'bad' | null for a change against a desired direction. Null when the change is inside
 * `tol` — noise, not movement — or when the direction is neutral.
 */
export function verdict(delta, good, tol = 0.5) {
  if (delta == null || !Number.isFinite(delta) || !good) return null
  if (Math.abs(delta) < tol) return null
  return Math.sign(delta) === Math.sign(good) ? 'good' : 'bad'
}

/**
 * One row per ratio that has at least two paired check-ins, with its latest value and the fitted
 * 4-week change. `tol` is the smallest ratio move worth a verdict (a 0.01 V-taper step).
 */
export function ratioRows(measurements, { bandwidthDays = 90, weeks = 4, tol = 0.01 } = {}) {
  const entries = Array.isArray(measurements) ? measurements : []
  return RATIOS.map(r => {
    const pts = entries
      .filter(e => e && e[r.num] != null && e[r.den] != null && +e[r.den] > 0)
      .map(e => ({ t: Date.parse(e.d + 'T12:00:00Z'), y: +e[r.num] / +e[r.den] }))
      .filter(p => Number.isFinite(p.t) && Number.isFinite(p.y))
      .sort((a, b) => a.t - b.t)
    if (pts.length < 2) return null
    const ch = trendChange(pts, { bandwidthDays, weeks })
    if (!ch) return null
    return { ...r, value: pts[pts.length - 1].y, delta: ch.delta, move: verdict(ch.delta, r.good, tol) }
  }).filter(Boolean)
}
