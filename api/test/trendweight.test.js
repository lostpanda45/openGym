// TrendWeight import (api/trendweight.js): the pure merge and the fetch contract. No server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realReadings, toUnit, mergeReadings, fetchMeasurements, LB_PER_KG } from '../trendweight.js';

const m = (date, kg, interpolated = false) => ({ date, actualWeight: kg, weightIsInterpolated: interpolated });

test('realReadings keeps real readings, drops interpolated and malformed, sorts oldest first', () => {
  const got = realReadings([
    m('2026-10-22', 84.56),
    m('2026-10-20', 85.079, true),   // interpolated day: synthetic weight, skipped
    { date: 'bad', actualWeight: 80 },
    m('2026-10-21', 83.9),
    m('2026-10-23', 0),
    null,
    m('2026-10-19', 84.2),
  ]);
  assert.deepEqual(got, [
    { d: '2026-10-19', kg: 84.2 },
    { d: '2026-10-21', kg: 83.9 },
    { d: '2026-10-22', kg: 84.56 },
  ]);
});

test('toUnit converts kg to lb and rounds to a tenth, like a typed weigh-in', () => {
  assert.equal(toUnit(84.56, 'kg'), 84.6);
  assert.equal(toUnit(84.56, 'lb'), Math.round(84.56 * LB_PER_KG * 10) / 10);
  assert.equal(toUnit(80, 'lb'), 176.4);
});

test('mergeReadings adds missing days, updates only its own, never a typed one', () => {
  const list = [
    { d: '2026-10-01', w: 85, t: 1 },                        // typed by the person
    { d: '2026-10-02', w: 84, t: 2, src: 'trendweight' },    // imported before
  ];
  const r = mergeReadings(list, undefined, [
    { d: '2026-10-01', kg: 84.9 },   // typed day: kept
    { d: '2026-10-02', kg: 83.2 },   // imported day: refreshed
    { d: '2026-10-03', kg: 83.0 },   // new
  ], { unit: 'kg', now: 99 });
  assert.deepEqual(r, { added: 1, updated: 1, kept: 1, skippedDeleted: 0 });
  const byDay = Object.fromEntries(list.map(b => [b.d, b]));
  assert.equal(byDay['2026-10-01'].w, 85);          // typed value untouched
  assert.equal(byDay['2026-10-02'].w, 83.2);        // refreshed
  assert.equal(byDay['2026-10-02'].t, 99);
  assert.equal(byDay['2026-10-03'].w, 83);
  assert.equal(byDay['2026-10-03'].src, 'trendweight');
  assert.deepEqual(list.map(b => b.d), ['2026-10-01', '2026-10-02', '2026-10-03']); // sorted
});

test('mergeReadings honours a deleted day and an unchanged one', () => {
  const list = [{ d: '2026-10-02', w: 84, t: 2, src: 'trendweight' }];
  const r = mergeReadings(list, { '2026-10-04': 500 }, [
    { d: '2026-10-02', kg: 84.0 },  // same value: kept, not rewritten
    { d: '2026-10-04', kg: 83.5 },  // deleted in the app: stays deleted
  ], { unit: 'kg', now: 100 });
  assert.deepEqual(r, { added: 0, updated: 0, kept: 1, skippedDeleted: 1 });
  assert.equal(list.length, 1);
  assert.equal(list[0].t, 2);   // unchanged entry keeps its stamp
});

test('mergeReadings writes pounds when the profile is in lb', () => {
  const list = [];
  mergeReadings(list, undefined, [{ d: '2026-10-02', kg: 80 }], { unit: 'lb', now: 1 });
  assert.equal(list[0].w, Math.round(80 * LB_PER_KG * 10) / 10);
});

test('fetchMeasurements sends the bearer key and the since window', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => [m('2026-10-02', 84)] };
  };
  const out = await fetchMeasurements({ apiKey: 'sk-test', since: '2026-10-01', fetchImpl });
  assert.equal(seen.url, 'https://trendweight.com/api/v1/measurements?since=2026-10-01');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(out.length, 1);
});

test('fetchMeasurements throws without the key or on a bad answer', async () => {
  await assert.rejects(() => fetchMeasurements({ apiKey: '' }), /no API key/);
  const status = n => async () => ({ ok: n < 300, status: n, json: async () => ({}) });
  await assert.rejects(() => fetchMeasurements({ apiKey: 'k', fetchImpl: status(401) }), /answered 401/);
  await assert.rejects(() => fetchMeasurements({ apiKey: 'k', fetchImpl: status(302) }), /redirects/);
  const notList = async () => ({ ok: true, status: 200, json: async () => ({ error: 'x' }) });
  await assert.rejects(() => fetchMeasurements({ apiKey: 'k', fetchImpl: notList }), /did not return a list/);
});
