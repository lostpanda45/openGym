// Trend for body measurements, computed from the stored check-ins on every render so a new
// manual entry is reflected at once — nothing is baked in.
//
// Tape and BIA readings are noisy and irregularly spaced: a tape is ±0.1-1.7 cm, a morning's
// hydration moves BIA muscle mass by ~1 kg, and sessions can be weeks apart. So the trend is a
// robust LOESS: a local linear fit with tricube weights over a time bandwidth, then one bisquare
// reweighting pass so a single bad reading (a mis-taped waist, a bad scan) is down-weighted
// instead of bending the line. Time, not point index, so irregular spacing cannot distort it.
// The rate is the fitted value now minus the fitted value N weeks ago — a difference of the
// smooth curve, not the last two raw points, which is exactly the noise a "since previous" delta
// shows.

const DAY = 86400000
const median = a => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Local linear regression at x0 from the points within `h` ms; if fewer than three, the three
// nearest. `rw` optionally reweights each point (robust pass). Returns the fitted value.
function loessAt(xs, ys, x0, h, rw) {
  const n = xs.length
  if (!n) return null
  if (n === 1) return ys[0]
  if (n === 2) {                                   // a straight line is the honest fit
    const b = (ys[1] - ys[0]) / (xs[1] - xs[0])
    return ys[0] + b * (x0 - xs[0])
  }
  let idx = []
  for (let i = 0; i < n; i++) {
    const d = Math.abs(xs[i] - x0)
    if (d <= h) idx.push([d, i])
  }
  if (idx.length < 3) {
    idx = xs.map((x, i) => [Math.abs(x - x0), i]).sort((a, b) => a[0] - b[0]).slice(0, 3)
  }
  const maxd = Math.max(idx[idx.length - 1][0], 1e-9)
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const [d, i] of idx) {
    const u = Math.min(d / maxd, 1)
    const w = (1 - u ** 3) ** 3 * (rw ? rw[i] : 1)
    if (w <= 0) continue
    sw += w; sx += w * xs[i]; sy += w * ys[i]; sxx += w * xs[i] ** 2; sxy += w * xs[i] * ys[i]
  }
  if (sw <= 0) return median(ys)
  const den = sw * sxx - sx * sx
  if (Math.abs(den) < 1e-9) return sy / sw
  const b = (sw * sxy - sx * sy) / den
  return (sy - b * sx) / sw + b * x0
}

// Cleveland's robust step: weight each point by how far it sits from the first fit, using a
// bisquare. A reading several times the typical residual gets dropped to zero, so one error
// cannot move the curve. Needs five points; below that there is no consensus to judge against.
function robustWeights(xs, ys, h) {
  const n = xs.length
  if (n < 5) return null
  const fit = xs.map(x => loessAt(xs, ys, x, h, null))
  const e = ys.map((y, i) => Math.abs(y - fit[i]))
  let s = 6 * median(e)
  if (s < 1e-9) s = Math.max(...e) / 2 || 1e-9            // all-but-one exact: judge on the outlier
  return e.map(v => { const u = v / s; return u >= 1 ? 0 : (1 - u * u) ** 2 })
}

const clean = points => (Array.isArray(points) ? points : [])
  .filter(p => p && p.y != null && Number.isFinite(+p.y) && Number.isFinite(+p.t))
  .map(p => ({ t: +p.t, y: +p.y }))
  .sort((a, b) => a.t - b.t)

// A smooth line through the check-ins, sampled across their span. Fewer than two points has no
// trend, so an empty list is returned and the chart simply draws no overlay.
export function trendPoints(points, { bandwidthDays = 90, maxSamples = 80 } = {}) {
  const pts = clean(points)
  if (pts.length < 2) return []
  const xs = pts.map(p => p.t), ys = pts.map(p => p.y)
  const h = bandwidthDays * DAY
  const rw = robustWeights(xs, ys, h)
  const t0 = xs[0], t1 = xs[xs.length - 1]
  if (t1 === t0) return [{ t: t0, y: ys.reduce((a, b) => a + b, 0) / ys.length }]
  const n = Math.min(maxSamples, Math.max(pts.length, 2))
  const out = []
  for (let i = 0; i < n; i++) {
    const t = t0 + (t1 - t0) * i / (n - 1)
    out.push({ t, y: loessAt(xs, ys, t, h, rw) })
  }
  return out
}

// How far the fitted trend moved over the last `weeks`. Null when there is nothing to fit.
export function trendChange(points, { weeks = 4, bandwidthDays = 90 } = {}) {
  const pts = clean(points)
  if (pts.length < 2) return null
  const xs = pts.map(p => p.t), ys = pts.map(p => p.y)
  const h = bandwidthDays * DAY
  const rw = robustWeights(xs, ys, h)
  const last = xs[xs.length - 1]
  const now = loessAt(xs, ys, last, h, rw)
  const then = loessAt(xs, ys, last - weeks * 7 * DAY, h, rw)
  return { delta: now - then, latest: ys[ys.length - 1], at: last }
}
