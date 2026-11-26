import type { RadarTask } from '../types'
import { ACCENT, BG, DIM, HAIR, SILK } from './board'

// Segmented plan bar: one segment per task. Pure: tasks in, SVG / cells out.
type Seg = 'done' | 'cur' | 'todo'
const segOf = (t: RadarTask): Seg => (t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'cur' : 'todo')

/** Graphic surfaces: `w` px wide, 10 px tall; segments shrink to fit, never overflow. */
export function planSvg(list: RadarTask[], w: number): string {
  const W = Math.max(40, Math.round(w)), H = 10, n = Math.max(1, list.length)
  const gap = n > 1 ? Math.min(3, (W * 0.25) / (n - 1)) : 0
  const sw = (W - gap * (n - 1)) / n
  const f = (v: number) => (Math.round(v * 100) / 100).toString()
  const p = list.map((t, i) => {
    const x = f(i * (sw + gap)), s = segOf(t)
    if (s === 'done') return `<rect x="${x}" y="2" width="${f(sw)}" height="6" rx="1" fill="${SILK}" fill-opacity=".85"/>`
    if (s === 'cur')
      return `<rect x="${x}" y="1" width="${f(sw)}" height="8" rx="1" fill="${ACCENT}"><animate attributeName="fill-opacity" values="1;.35;1" dur="1.2s" repeatCount="indefinite"/></rect>`
    // Outline inset by half its stroke, so it stays inside its slot however thin.
    const ins = Math.min(0.5, sw / 4)
    return `<rect x="${f(i * (sw + gap) + ins)}" y="2.5" width="${f(sw - 2 * ins)}" height="5" rx="1" fill="none" stroke="${HAIR}" stroke-width="${f(Math.min(1, sw / 2))}"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${BG}"/>${p.join('')}</svg>`
}

/** Terminal: `w` cells of block characters, as [text, kind] runs. */
export function planCells(list: RadarTask[], w: number): [string, Seg][] {
  const n = list.length, cells = Math.max(1, w)
  if (!n) return []
  const segs = list.map(segOf)
  // Room for one cell per task plus a gap: wider blocks, a space between.
  if (n * 2 - 1 <= cells) {
    const size = Math.max(1, Math.floor((cells + 1) / n) - 1)
    return segs.flatMap((s, i) => [[(s === 'todo' ? '░' : '█').repeat(size), s] as [string, Seg], ...(i < n - 1 ? [[' ', 'todo'] as [string, Seg]] : [])])
  }
  // More tasks than cells: each cell stands for the task under its middle.
  return Array.from({ length: Math.min(cells, n) }, (_, j) => {
    const s = segs[Math.floor(((j + 0.5) * n) / Math.min(cells, n))] ?? 'todo'
    return [s === 'todo' ? '░' : '█', s] as [string, Seg]
  })
}

export const SEG_COLOR: Record<Seg, string> = { done: SILK, cur: ACCENT, todo: DIM }
