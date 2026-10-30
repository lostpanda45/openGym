/* Optional daily weight import from TrendWeight (https://trendweight.com/api/v1).
 *
 * A scale that only reports to TrendWeight still feeds openGym: the api pulls the account's
 * daily measurements on a timer and folds the real scale readings into each profile's
 * `bodyweight` list, so the morning number does not have to be typed in twice. Off unless
 * TRENDWEIGHT_API_KEY is set (see server.js). TrendWeight is the only unit source: every weight
 * it returns is kilograms, and every openGym weigh-in is stored in the profile's display unit,
 * so toUnit() is the one place the conversion happens.
 *
 * The merge is conservative on purpose. A day the person logged by hand is never overwritten;
 * only a day this importer itself wrote (`src: 'trendweight'`) is refreshed. A day the app
 * records as deleted (`deleted.bodyweight`) stays deleted, so removing an imported weigh-in is
 * not undone on the next pull. Days TrendWeight interpolated (no real scale reading) carry a
 * synthetic weight and are skipped: an imported curve should be real readings only, and
 * openGym already computes its own trend from them.
 */

export const TRENDWEIGHT_BASE = 'https://trendweight.com/api/v1';
export const LB_PER_KG = 2.2046226218;

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The real (non-interpolated) daily readings from a GET /measurements response, as
 * `{ d, kg }` sorted oldest first. Anything without a real scale weight is dropped.
 */
export function realReadings(json) {
  if (!Array.isArray(json)) return [];
  const out = [];
  for (const m of json) {
    if (!m || typeof m !== 'object') continue;
    if (!isDate(m.date) || m.weightIsInterpolated === true) continue;
    const kg = finite(m.actualWeight);
    if (kg == null || kg <= 0) continue;
    out.push({ d: m.date, kg });
  }
  out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return out;
}

/** kg (TrendWeight's only unit) to the profile's display unit, to 0.1 like a typed weigh-in. */
export function toUnit(kg, unit) {
  const v = unit === 'lb' ? kg * LB_PER_KG : kg;
  return Math.round(v * 10) / 10;
}

/**
 * Fold `readings` ({ d, kg }) into a `bodyweight` list in place. `deleted` is the document's
 * `deleted.bodyweight` map (day -> stamp); a day on record there is left out. A day already
 * logged by hand is kept; only an entry this importer wrote (`src: 'trendweight'`) is updated.
 * New and updated entries carry `t: now` so a device's union-by-day merge keeps the import.
 * Returns counts.
 */
export function mergeReadings(bodyweight, deleted, readings, { unit = 'kg', now = Date.now() } = {}) {
  const list = Array.isArray(bodyweight) ? bodyweight : [];
  const del = deleted && typeof deleted === 'object' && !Array.isArray(deleted) ? deleted : {};
  const byDay = new Map();
  for (const b of list) if (b && isDate(b.d)) byDay.set(b.d, b);
  let added = 0, updated = 0, kept = 0, skippedDeleted = 0;
  for (const r of readings) {
    if (!r || !isDate(r.d)) continue;
    if (del[r.d]) { skippedDeleted++; continue; }
    const w = toUnit(r.kg, unit);
    if (!(w > 0)) continue;
    const cur = byDay.get(r.d);
    if (!cur) {
      const e = { d: r.d, w, t: now, src: 'trendweight' };
      list.push(e);
      byDay.set(r.d, e);
      added++;
    } else if (cur.src === 'trendweight') {
      if (Number(cur.w) !== w) { cur.w = w; cur.t = now; updated++; } else { kept++; }
    } else {
      kept++;   // a weigh-in the person typed: never overwritten
    }
  }
  list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { added, updated, kept, skippedDeleted };
}

/**
 * GET the account's measurements. Resolves the raw array; throws a short message (never the
 * key) on a redirect, a non-2xx, or a body that is not a list. `fetchImpl` is for tests.
 */
export async function fetchMeasurements({ apiKey, since, fetchImpl = fetch, timeoutMs = 15000, base = TRENDWEIGHT_BASE } = {}) {
  if (!apiKey) throw new Error('no API key');
  const url = new URL(base + '/measurements');
  if (since) url.searchParams.set('since', since);
  const res = await fetchImpl(url.toString(), {
    headers: { Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    // A redirect could carry the key to another host; treat it as an error, as api-client does.
    redirect: 'manual',
  });
  if (res.status >= 300 && res.status < 400) throw new Error(`TrendWeight redirects (${res.status})`);
  if (!res.ok) throw new Error(`TrendWeight answered ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) throw new Error('TrendWeight did not return a list');
  return data;
}
