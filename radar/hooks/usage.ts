import type { RadarRow, RadarSpend } from '../types'
import { pretty } from './model-name'

// Handoff presets in tokens of context; 0 = off.
export const PRESETS = [0, 100_000, 150_000, 200_000, 300_000, 500_000] as const
export const COST_KEY = 'cost'
export const HANDOFF_KEY = 'handoff'

/** 999 -> '999', 1000 -> '1.0k', 12300 -> '12.3k', 1.2e6 -> '1.2M'. */
export function fmt(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 999_950) return `${(n / 1e3).toFixed(1)}k`
  return `${(n / 1e6).toFixed(1)}M`
}

/** Short preset label: 0 -> null (caller shows OFF), 200000 -> '200k'. */
export const presetLabel = (n: number) => (n > 0 ? `${n / 1000}k` : '')

export const rowTotal = (r: RadarRow) => r.i + r.o + r.r + r.c
export const sum = (rows: RadarRow[]) => rows.reduce((n, r) => n + rowTotal(r), 0)

/** Fold rows of one model into one; order by first appearance. */
export function addRow(rows: RadarRow[], add: RadarRow): RadarRow[] {
  const hit = rows.find(r => r.m === add.m)
  if (!hit) return [...rows, add]
  return rows.map(r => (r === hit ? { m: r.m, i: r.i + add.i, o: r.o + add.o, r: r.r + add.r, c: r.c + add.c } : r))
}

/** Model with most tokens, pretty-printed, '+N' when more models ran. */
export function topModel(rows: RadarRow[]): string {
  if (!rows.length) return '?'
  const top = [...rows].sort((a, b) => rowTotal(b) - rowTotal(a))[0]!
  return pretty(top.m) + (rows.length > 1 ? ` +${rows.length - 1}` : '')
}

export type Spender = { id: string; type: string; model: string; n: number; rows: RadarRow[]; usd?: number }
/** Main first, running subagents one each, finished ones folded by type+model (summed, x n). Not groupAgents: it keeps one entry and no sums. */
export function spenders(main: RadarRow[], subs: RadarSpend[], mainName: string): Spender[] {
  const out: Spender[] = [{ id: 'main', type: mainName, model: topModel(main), n: 1, rows: main }]
  const done = new Map<string, Spender>()
  for (const a of subs) {
    const model = topModel(a.rows)
    if (!a.done) { out.push({ id: a.id, type: a.type, model, n: 1, rows: a.rows, usd: a.usd }); continue }
    const k = `${a.type}|${model}`
    const g = done.get(k)
    if (!g) { done.set(k, { id: a.id, type: a.type, model, n: 1, rows: a.rows, usd: a.usd }); continue }
    g.n++
    g.rows = a.rows.reduce(addRow, g.rows)
    if (a.usd !== undefined) g.usd = (g.usd ?? 0) + a.usd
  }
  return [...out, ...done.values()]
}

/** Totals per pretty model name across every row, biggest first. */
export function byModel(all: RadarRow[][]): { m: string; row: RadarRow }[] {
  const acc = new Map<string, RadarRow>()
  for (const rows of all) for (const r of rows) {
    const k = pretty(r.m)
    acc.set(k, addRow([acc.get(k) ?? { m: k, i: 0, o: 0, r: 0, c: 0 }], { ...r, m: k })[0]!)
  }
  return [...acc].map(([m, row]) => ({ m, row })).sort((a, b) => rowTotal(b.row) - rowTotal(a.row))
}

export const bar = (pct: number, w: number) => {
  const n = Math.max(0, Math.min(w, Math.round((pct / 100) * w)))
  return '█'.repeat(n) + '░'.repeat(w - n)
}

/** '2h 14m' / '14m' / '3d 2h'; undefined past or unparsable. */
export function until(iso: string | undefined, now: number): string | undefined {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at) || at <= now) return undefined
  const m = Math.floor((at - now) / 60000)
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

/** Attention levels shared by the strip and the tab: >=95 error, >=80 bright. */
export const level = (pct: number): 'ok' | 'hi' | 'err' => (pct >= 95 ? 'err' : pct >= 80 ? 'hi' : 'ok')
