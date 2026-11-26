import type { RadarAgent, RadarCall } from '../types'
import { pretty } from './model-name'
import { ERR, ERR_SOFT, esc, groupAgents, type Kind, KIND_COLOR, short, STATIONS } from './shared'

// Circuit-board view of the same data the radar draws. Pure: data in, SVG string out.
// Base design is 400x330 user units; the board grows in width or height to match the box aspect,
// so text keeps one scale. Extra height is spread over every band; label gaps stay free of traces.

type P = [number, number]
const n1 = (v: number) => (Math.round(v * 10) / 10).toString()
const pathOf = (pts: P[]) => 'M' + pts.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' L')
const FONT = `font-family="'JetBrains Mono',Consolas,'DejaVu Sans Mono',monospace"`
// Claude desktop greys + a cold accent (warm hues read as an overheating chip).
export const BG = '#262624', RAISED = '#30302e', DEEP = '#1f1e1d', HAIR = '#3d3d3a'
export const SILK = '#c2c0b6', DIM = '#8a8880', ACCENT = '#5cc8ff', ACCENT_HI = '#a5e8ff'
export const SUB = KIND_COLOR.agent
const SPACING = 6

// Parallel copy of a polyline at distance d (left normal of travel), mitred at corners.
function offset(pts: P[], d: number): P[] {
  const nrm = (a: P, b: P): P => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return [-dy / l, dx / l]
  }
  return pts.map((p, i) => {
    const na = i > 0 ? nrm(pts[i - 1]!, p) : undefined
    const nb = i < pts.length - 1 ? nrm(p, pts[i + 1]!) : undefined
    if (!na || !nb) {
      const n = (na ?? nb)!
      return [p[0] + n[0] * d, p[1] + n[1] * d]
    }
    const mx = na[0] + nb[0], my = na[1] + nb[1], ml = Math.hypot(mx, my) || 1
    const ux = mx / ml, uy = my / ml
    const s = d / (ux * na[0] + uy * na[1])
    return [p[0] + ux * s, p[1] + uy * s]
  })
}

type Side = 'bottom' | 'left' | 'right'
type Chip = { cx: number; cy: number; side: Side; route: P[]; bus?: P }
const CW = 64, CH = 24 // peripheral chip body
const PK = 44, PT = 50 // CPU package half-size, pin-tip half-size (before the CPU scale)
const SW = 24, SH = 16 // subagent chip body
const BLOCK = SH + 12 // subagent body plus its third label line

// Board size for a box aspect (width / height): never smaller than the 400x330 design.
export function boardSize(aspect: number): { W: number; H: number } {
  const a = Math.min(3, Math.max(0.5, Number.isFinite(aspect) && aspect > 0 ? aspect : 400 / 330))
  return { W: Math.round(Math.max(400, 330 * a)), H: Math.round(Math.max(330, 400 / a)) }
}

// Period shared by the CPU core glow and the pulse: slow breathing idle, faster with more live calls.
const beat = (live: number) => (live ? Math.max(1, 2.4 - 0.35 * live) : 4)

function layout(W: number, H: number, rows: 1 | 2) {
  const E = H - 330
  // the CPU grows in tall boards, bounded by the room beside it for the side chips' routes
  const k = Math.max(1, Math.min(1 + Math.min(0.4, E / 500), (W / 2 - 112) / PT))
  const PTs = PT * k
  const dx = (W - 400) * 0.15
  const T = 38 + E * 0.05 // top chip row
  const cy = 150 + E * 0.48
  const G = 30 + E * 0.25 // side chips above / below the CPU centre
  const cx = W / 2
  const lx = 44 + dx, rx = W - 44 - dx, sl = 70 + dx, sr = W - 70 - dx
  const side = (x: number, y: number, s: 'left' | 'right'): Chip => {
    const d = s === 'right' ? 1 : -1 // direction of travel toward the CPU
    const ty = y < cy ? cy - 18 * k : cy + 18 * k
    const end = cx - d * PTs
    const dd = Math.max(4, Math.min(Math.abs(y - ty), Math.abs(end - x) - 37 - 16))
    return { cx: x, cy: y, side: s, route: [[x + d * 37, y], [end - d * (12 + dd), y], [end - d * 12, ty], [end, ty]] }
  }
  // top buses bend at B, between the top chips and the CPU
  const B = T + 17 + (cy - PTs - T - 17) * 0.45
  const chips: Record<Kind, Chip> = {
    tool: side(lx, cy - G, 'right'),
    web: side(lx, cy + G, 'right'),
    plugin: side(rx, cy - G, 'left'),
    webhook: side(rx, cy + G, 'left'),
    skill: { cx: sl, cy: T, side: 'bottom', route: [[sl, T + 17], [sl, B - 12], [sl + 12, B], [cx - 36, B], [cx - 24, B + 12], [cx - 24, cy - PTs]], bus: [sl + 58, B - 14] },
    agent: { cx, cy: T, side: 'bottom', route: [[cx, T + 17], [cx, cy - PTs]] },
    mcp: { cx: sr, cy: T, side: 'bottom', route: [[sr, T + 17], [sr, B - 12], [sr - 12, B], [cx + 36, B], [cx + 24, B + 12], [cx + 24, cy - PTs]], bus: [sr - 86, B - 14] },
  }
  // Subagent area: below the CPU and the lower side chips, down to the readout line.
  const readY = H - 34, a0 = Math.max(cy + PTs + 8, cy + G + 22), a1 = readY - 12
  // one row hangs under the bus; two rows sit either side of it
  const bus = rows === 1 ? a0 + Math.max(10, (a1 - a0 - BLOCK) * 0.2) : (a0 + a1) / 2
  const rowY = rows === 1
    ? [bus + 10 + Math.max(0, (a1 - bus - 10 - BLOCK) * 0.55)]
    : [a0 + Math.max(0, (bus - 10 - a0 - BLOCK) * 0.5), bus + 10 + Math.max(0, (a1 - bus - 10 - BLOCK) * 0.5)]
  const step = Math.max(92, W / 2 - 108)
  const slotX = [14, 14 + step, cx + 10, cx + 10 + step]
  const barY = [bus - 6, bus, bus + 6]
  return { cx, cy, k, PTs, T, chips, slotX, rowY, barY, readY, sl, sr, step }
}

// Static decoration for a board size: grid, rulers, HUD corners, micro-vias.
function decor(W: number, H: number, L: ReturnType<typeof layout>): string {
  const p: string[] = []
  // full-bleed so any letterbox band the host leaves still shows substrate
  p.push(`<rect x="${-W}" y="${-H}" width="${W * 3}" height="${H * 3}" fill="${BG}"/><rect x="${-W}" y="${-H}" width="${W * 3}" height="${H * 3}" fill="url(#grid)"/>`)
  let t = ''
  for (let x = 20; x <= W - 20; x += 10) t += `M${x},0 v${x % 50 ? 2 : 4} `
  for (let y = 20; y <= H - 20; y += 10) t += `M0,${y} h${y % 50 ? 2 : 4} M${W},${y} h${y % 50 ? -2 : -4} `
  p.push(`<path d="${t}" stroke="${DIM}" stroke-opacity=".45" stroke-width=".6"/>`)
  for (let x = 100; x <= W - 40; x += 100) p.push(`<text x="${x}" y="10" text-anchor="middle" font-size="4.5" fill="${DIM}" fill-opacity=".6" ${FONT}>${String(x).padStart(3, '0')}</text>`)
  p.push(`<path d="M3,15 V3 H15 M${W - 15},3 H${W - 3} V15 M3,${H - 15} V${H - 3} H15 M${W - 15},${H - 3} H${W - 3} V${H - 15}" stroke="${DIM}" stroke-opacity=".7" stroke-width="1" fill="none"/>`)
  // thin dead-end traces and micro-vias in the free zones beside the top buses
  const { sl, sr, cx, cy, T } = L
  const y1 = T + 22, y2 = T + 19, vo = L.PTs + 12
  p.push(`<path d="M${n1(sl + 30)},${n1(y1)} h10 l3,-3 h9 M${n1(sr - 52)},${n1(y2)} h9 l3,3 h10" stroke="${HAIR}" stroke-width=".8" fill="none"/>`)
  const vias: P[] = [[sl + 30, y1], [sl + 52, y2], [sr - 52, y2], [sr - 30, y1], [cx - vo, cy + 40], [cx + vo, cy + 40], [cx - vo, cy - 40], [cx + vo, cy - 40]]
  p.push(`<path d="${vias.map(([x, y]) => `M${n1(x - 0.9)},${n1(y)} a.9,.9 0 1,0 1.8,0 a.9,.9 0 1,0 -1.8,0`).join(' ')}" fill="${DIM}" fill-opacity=".7"/>`)
  p.push(`<text x="14" y="${n1(L.readY)}" font-size="7.5" fill="${SILK}" fill-opacity=".6" ${FONT} letter-spacing=".6">RADAR-MB</text><text x="60" y="${n1(L.readY)}" font-size="5.5" fill="${DIM}" ${FONT}>REV 3.1</text>`)
  return p.join('')
}

export function boardSvg(list: RadarAgent[], cls: RadarCall[], mainModel: string, aspect = 400 / 330): string {
  const { W, H } = boardSize(aspect)
  const groups = groupAgents(list)
  const two = groups.length > 4
  const L = layout(W, H, two ? 2 : 1)
  const { cx, cy, k, PTs } = L
  const live = cls.filter(c => c.status === 'run')
  const busy = live.length > 0
  const period = n1(beat(live.length))
  const p: string[] = []
  p.push(`<defs>
<pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r=".5" fill="#34332f"/></pattern>
<radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${ACCENT}" stop-opacity=".5"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="clipB"><rect width="${W}" height="${H}"/></clipPath>
</defs>`)
  p.push(decor(W, H, L))

  // pulse: rings born at the CPU that grow and fade; more rings, faster and brighter with more live calls
  const rings = live.length >= 3 ? 3 : busy ? 2 : 1
  const peak = busy ? Math.min(0.6, 0.3 + live.length * 0.06).toFixed(2) : '.18'
  let pulse = ''
  for (let i = 0; i < rings; i++) {
    const at = `dur="${period}s" begin="${n1((i * Number(period)) / rings)}s" repeatCount="indefinite"`
    pulse += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(PTs)}" fill="none" stroke="${ACCENT}" stroke-width="1.3" opacity="0"><animate attributeName="r" from="${n1(PTs)}" to="${n1(Math.hypot(W, H) * 0.6)}" ${at}/><animate attributeName="opacity" values="${peak};0" ${at}/></circle>`
  }
  p.push(`<g id="pulse" clip-path="url(#clipB)">${pulse}</g>`)

  // peripheral chips and their buses
  STATIONS.forEach((st, i) => {
    const c = L.chips[st.kind]
    const col = KIND_COLOR[st.kind]
    const used = cls.filter(x => x.kind === st.kind)
    const n = used.length
    const errs = used.filter(x => x.status === 'error').length
    const running = live.filter(x => x.kind === st.kind).length
    const ds = [0, 1, 2].map(k => pathOf(offset(c.route, (k - 1) * SPACING)))
    // idle: thin dim hairlines; used: colored, brighter with use; live: glowing with light streaks
    ds.forEach((d, k) => p.push(`<path id="t${i}${k}" d="${d}" stroke="${HAIR}" stroke-width="1.1" fill="none" stroke-linejoin="round"/>`))
    if (n) {
      const g: string[] = ds.map(d => `<path d="${d}" stroke="${col}" stroke-opacity="${(0.25 + Math.min(n, 20) / 30).toFixed(2)}" stroke-width="${(0.9 + Math.min(n, 24) / 20).toFixed(2)}" fill="none" stroke-linejoin="round"/>`)
      for (let k = 0; k < Math.min(running, 3); k++) {
        // outer traces carry requests CPU->chip, the middle one carries replies back
        const rev = k !== 1 ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''
        g.push(`<rect x="-5" y="-.8" width="10" height="1.6" rx=".8" fill="#fff" stroke="${col}" stroke-width="1"><animateMotion dur="1.1s" begin="${(k * 0.37).toFixed(2)}s" repeatCount="indefinite" rotate="auto"${rev}><mpath href="#t${i}${k}"/></animateMotion></rect>`)
      }
      p.push(`<g${running ? ' filter="url(#glow)"' : ''}>${g.join('')}</g>`)
    }
    if (c.bus) p.push(`<text x="${n1(c.bus[0])}" y="${n1(c.bus[1])}" font-size="5.5" fill="${DIM}" ${FONT}>${esc(st.kind.slice(0, 3).toUpperCase())}[0:2] · ${String(n).padStart(2, '0')}</text>`)

    // body: raised package, accent stripe, LED bar, fine pin row on the bus side
    const bx = c.cx - CW / 2, by = c.cy - CH / 2
    let pins = ''
    for (let o = -12; o <= 12; o += 3) {
      if (c.side === 'bottom') pins += `M${n1(c.cx + o - 0.6)},${n1(by + CH)} h1.2 v4 h-1.2z `
      else if (c.side === 'right') pins += `M${n1(bx + CW)},${n1(c.cy + o - 0.6)} h4 v1.2 h-4z `
      else pins += `M${n1(bx)},${n1(c.cy + o - 0.6)} h-4 v1.2 h4z `
    }
    p.push(`<path d="${pins}" fill="${n ? col : DIM}" fill-opacity="${n ? 0.8 : 0.5}">${running ? `<animate attributeName="fill-opacity" values=".4;1;.4" dur=".6s" repeatCount="indefinite"/>` : ''}</path>`)
    p.push(`<rect x="${n1(bx)}" y="${n1(by)}" width="${CW}" height="${CH}" rx="3" fill="${RAISED}" stroke="${n ? col : HAIR}" stroke-opacity="${n ? 0.85 : 1}"/>`)
    p.push(`<rect x="${n1(bx + 4)}" y="${n1(by + 3)}" width="${CW - 8}" height="1.2" fill="${col}" fill-opacity="${n ? 0.9 : 0.25}"/>`)
    p.push(`<path d="M${n1(bx)},${n1(by + 5)} l5,-5" stroke="${DIM}" stroke-width=".6"/>`)
    p.push(`<text x="${n1(c.cx)}" y="${n1(c.cy + 3.5)}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="${n ? SILK : DIM}" ${FONT} letter-spacing=".4">${esc(st.label.toUpperCase())}</text>`)
    // LED bar: up to 5 segments by use, blinking while live
    const lit = n ? Math.min(5, Math.ceil(n / 4)) : 0
    let seg = ''
    for (let s = 0; s < 5; s++) seg += `<rect x="${n1(bx + CW - 22 + s * 4)}" y="${n1(by + CH - 4)}" width="3" height="1.4" fill="${s < lit ? col : HAIR}"/>`
    p.push(`<g>${running ? `<animate attributeName="opacity" values="1;.3;1" dur=".5s" repeatCount="indefinite"/>` : ''}${seg}</g>`)
    // silkscreen designator + use count above the body, error LED after it
    const label = `U${i + 2}${n ? ` ×${n}` : ''}`
    const ly = by - 4
    p.push(`<text x="${n1(bx)}" y="${n1(ly)}" font-size="9" fill="${n ? SILK : DIM}" ${FONT}>${esc(label)}</text>`)
    if (errs) {
      const ex = bx + label.length * 5.4 + 6
      p.push(`<circle cx="${n1(ex)}" cy="${n1(ly - 3)}" r="2.3" fill="${ERR}" filter="url(#glow)"/><text x="${n1(ex + 5)}" y="${n1(ly)}" font-size="9" fill="${ERR_SOFT}" ${FONT}>${errs}</text>`)
    }
  })

  // expansion bus J1 to the subagent slots: running chips one each, finished ones grouped with a count
  const anyRun = groups.some(g => !g.ag.isDone)
  const bar: string[] = []
  L.barY.forEach((y, k) => bar.push(`M${n1(cx - 6 + k * 6)},${n1(cy + PTs)} V${n1(y)}`, `M14,${n1(y)} H${W - 22}`))
  p.push(`<path d="${bar.join(' ')}" stroke="${HAIR}" stroke-width="1.1" fill="none"/>`)
  if (anyRun) p.push(`<path d="${bar.join(' ')}" stroke="${SUB}" stroke-opacity=".55" stroke-width="1" fill="none" filter="url(#glow)"/>`)
  p.push(`<path d="${L.barY.map((y, k) => `M${n1(cx - 7.2 + k * 6)},${n1(y)} h2.4`).join(' ')}" stroke="${anyRun ? SUB : DIM}" stroke-width="2.4"/>`)
  p.push(`<text x="${W - 18}" y="${n1(L.barY[1]! + 3)}" font-size="8" fill="${SILK}" fill-opacity=".7" ${FONT}>J1</text>`)

  // label room right of each body, in characters at ~4.85 units per char (8-unit mono)
  const chars = Math.max(8, Math.floor((L.step - SW - 8) / 4.85))
  const subFx: string[] = []
  // empty footprints only fill out the last row in use
  const slots = two ? 8 : groups.length ? 4 : 0
  for (let i = 0; i < slots; i++) {
    const x = L.slotX[i % 4]!, top = two && i < 4
    const y = L.rowY[two && i >= 4 ? 1 : 0]!
    const gr = groups[i]
    if (!gr) {
      p.push(`<rect x="${n1(x - 2)}" y="${n1(y - 2)}" width="${SW + 4}" height="${SH + 4}" rx="2" fill="none" stroke="${HAIR}" stroke-dasharray="2 2"/>`)
      continue
    }
    const { ag, n } = gr
    const run = !ag.isDone
    const stub = top ? `M${n1(x + SW / 2)},${n1(y + SH + 3)} V${n1(L.barY[0]!)}` : `M${n1(x + SW / 2)},${n1(L.barY[2]!)} V${n1(y - 3)}`
    p.push(`<path d="${stub}" stroke="${run ? SUB : HAIR}" stroke-width="1.1"${run ? ' filter="url(#glow)"' : ''}/>`)
    p.push(`<g opacity="${run ? 1 : 0.6}">`)
    let pins = ''
    for (let o = 3; o <= SW - 4; o += 4) pins += `M${n1(x + o)},${n1(y - 3)} h1.2 v3 h-1.2z M${n1(x + o)},${n1(y + SH)} h1.2 v3 h-1.2z `
    p.push(`<path d="${pins}" fill="${run ? SUB : DIM}" fill-opacity=".8">${run ? `<animate attributeName="fill-opacity" values=".3;1;.3" dur=".8s" repeatCount="indefinite"/>` : ''}</path>`)
    p.push(`<rect x="${n1(x)}" y="${n1(y)}" width="${SW}" height="${SH}" rx="2" fill="${RAISED}" stroke="${run ? SUB : HAIR}"/>`)
    p.push(`<text x="${n1(x + SW / 2)}" y="${n1(y + 11)}" text-anchor="middle" font-size="7" fill="${SILK}" ${FONT}>${run ? `U${9 + i}` : n > 1 ? `×${n}` : '✓'}</text>`)
    if (run) p.push(`<circle cx="${n1(x + SW - 3)}" cy="${n1(y + 3)}" r="1.3" fill="${SUB}"><animate attributeName="fill-opacity" values="1;.15;1" dur=".7s" repeatCount="indefinite"/></circle>`)
    // a long type is cut, never the ×N
    const suffix = n > 1 ? ` ×${n}` : '', prefix = run ? '' : '✓ '
    const name = prefix + short(ag.type.toUpperCase(), Math.max(3, chars - prefix.length - suffix.length)) + suffix
    const lx = x + SW + 5
    p.push(`<text x="${n1(lx)}" y="${n1(y + 6)}" font-size="8" fill="${SILK}" ${FONT}>${esc(name)}</text>`)
    p.push(`<text x="${n1(lx)}" y="${n1(y + 15)}" font-size="7.5" fill="${run ? '#c4b5fd' : DIM}" ${FONT}>${esc(short(pretty(ag.model).toUpperCase(), chars))}</text>`)
    p.push(`<text x="${n1(lx)}" y="${n1(y + 24)}" font-size="6.5" fill="${run ? ACCENT_HI : DIM}" ${FONT}>${esc(short(run ? (ag.tool ? `→ ${ag.tool}` : 'EN CURSO') : n > 1 ? `${n} HECHOS` : 'HECHO', chars + 2))}</text>`)
    p.push(`</g>`)
    if (run) {
      // reports stream up to the CPU, orders stream back down
      p.push(`<path id="sa${i}" d="M${n1(x + SW / 2)},${n1(top ? y + SH + 3 : y - 3)} V${n1(L.barY[1]!)} H${n1(cx)} V${n1(cy + PTs)}" fill="none" stroke="none"/>`)
      for (const [dur, begin, color, rev] of [['1.5s', '0s', SUB, false], ['1.5s', '.75s', SUB, false], ['2.1s', '.4s', ACCENT, true]] as const)
        subFx.push(`<rect x="-4" y="-.8" width="8" height="1.6" rx=".8" fill="#fff" stroke="${color}" stroke-width="1"><animateMotion dur="${dur}" begin="${begin}" repeatCount="indefinite" rotate="auto"${rev ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}><mpath href="#sa${i}"/></animateMotion></rect>`)
    }
  }
  if (subFx.length) p.push(`<g filter="url(#glow)">${subFx.join('')}</g>`)

  // CPU, drawn at the 1x design and scaled about its centre: substrate, pins, heat spreader, live die
  const c: string[] = []
  let cpins = ''
  for (let o = -30; o <= 30; o += 6)
    cpins += `M${cx + o - 1},${cy - PT} h2 v6 h-2z M${cx + o - 1},${cy + PK} h2 v6 h-2z M${cx - PT},${cy + o - 1} h6 v2 h-6z M${cx + PK},${cy + o - 1} h6 v2 h-6z `
  c.push(`<path d="${cpins}" fill="#a9b6c2"/>`)
  c.push(`<path d="M${cx - PK + 6},${cy - PK} H${cx + PK - 3} q3,0 3,3 V${cy + PK - 3} q0,3 -3,3 H${cx - PK + 3} q-3,0 -3,-3 V${cy - PK + 6} Z" fill="${RAISED}" stroke="${HAIR}"/>`)
  let pads = ''
  for (let o = -36; o <= 36; o += 4)
    for (const r of [39, 35]) pads += `M${cx + o - 0.7},${cy - r - 0.7} h1.4 v1.4 h-1.4z M${cx + o - 0.7},${cy + r - 0.7} h1.4 v1.4 h-1.4z ${Math.abs(o) < 33 ? `M${cx - r - 0.7},${cy + o - 0.7} h1.4 v1.4 h-1.4z M${cx + r - 0.7},${cy + o - 0.7} h1.4 v1.4 h-1.4z ` : ''}`
  c.push(`<path d="${pads}" fill="#5d7a8c" fill-opacity=".7"/>`)
  c.push(`<path d="M${cx - PK},${cy - PK + 6} l6,-6" stroke="${ACCENT}" stroke-width="1.2"/>`)
  c.push(`<rect x="${cx - 31}" y="${cy - 31}" width="62" height="62" rx="3" fill="#2a2c2e" stroke="${HAIR}"/>`)
  c.push(`<rect x="${cx - 28}" y="${cy - 28}" width="56" height="56" rx="2" fill="${DEEP}" stroke="${ACCENT}" stroke-opacity=".35"/>`)
  // energy running around the die frame; fast when busy, slow breathing when idle
  c.push(`<rect x="${cx - 28}" y="${cy - 28}" width="56" height="56" rx="2" fill="none" stroke="${ACCENT}" stroke-width="1.4" stroke-dasharray="10 18" filter="url(#glow)"><animate attributeName="stroke-dashoffset" from="0" to="-224" dur="${busy ? 1.6 : 8}s" repeatCount="indefinite"/></rect>`)
  // cold glow under the die, breathing on the pulse's beat
  c.push(`<circle cx="${cx}" cy="${cy}" r="24" fill="url(#core)"><animate attributeName="opacity" values="${busy ? '.5;1;.5' : '.25;.55;.25'}" dur="${period}s" repeatCount="indefinite"/></circle>`)
  // die cells in the four corners light up in turn
  const cells: P[] = [[-24, -24], [18, -24], [18, 20], [-24, 20]]
  cells.forEach(([ox, oy], k) =>
    c.push(`<path d="M${cx + ox},${cy + oy} h2.4 v2.4 h-2.4z m3.4,0 h2.4 v2.4 h-2.4z m-3.4,3.4 h2.4 v2.4 h-2.4z m3.4,0 h2.4 v2.4 h-2.4z" fill="${ACCENT}" opacity=".2"><animate attributeName="opacity" values=".15;.95;.15" dur="${busy ? 1.2 : 6}s" begin="${(k * (busy ? 0.3 : 1.5)).toFixed(1)}s" repeatCount="indefinite"/></path>`),
  )
  c.push(`<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="11" font-weight="bold" fill="#eef6fb" ${FONT}>${esc(short(pretty(mainModel).toUpperCase(), 9))}</text>`)
  c.push(`<text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="7" fill="${ACCENT}" ${FONT} letter-spacing=".8">PRINCIPAL</text>`)
  p.push(k === 1 ? c.join('') : `<g transform="translate(${n1(cx)},${n1(cy)}) scale(${n1(k)}) translate(${n1(-cx)},${n1(-cy)})">${c.join('')}</g>`)
  p.push(`<text x="${n1(cx - PTs - 12)}" y="${n1(cy - PTs + 4)}" font-size="8" fill="${SILK}" fill-opacity=".8" ${FONT}>U1</text>`)

  // readout + status strip, anchored to the bottom edge
  const errN = cls.filter(c => c.status === 'error').length
  const read = `CALLS ${cls.length} · LIVE ${live.length} · ERR ${errN} · SUB ${list.filter(a => !a.isDone).length}/${list.length}`
  p.push(`<text x="${W - 14}" y="${n1(L.readY)}" text-anchor="end" font-size="5.5" fill="${DIM}" ${FONT}>${esc(read)}</text>`)
  const now = live[live.length - 1]
  const sc = now ? KIND_COLOR[now.kind] : HAIR
  const msg = now ? `● ${now.agent} (${pretty(now.model)}) → ${now.kind === 'mcp' || now.kind === 'plugin' ? now.target : now.tool}` : '○ en espera'
  p.push(`<rect x="${cx - 150}" y="${H - 27}" width="300" height="20" rx="3" fill="${RAISED}" stroke="${sc}" stroke-opacity="${now ? 0.9 : 1}"/><text x="${cx}" y="${H - 13}" text-anchor="middle" font-size="10" fill="${now ? sc : DIM}" ${FONT}>${esc(short(msg, 44))}</text>`)

  // width is oversized on purpose: the host clamps it to the slot and the height comes from the Svg prop
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 3}" height="${H * 3}">${p.join('')}</svg>`
}
