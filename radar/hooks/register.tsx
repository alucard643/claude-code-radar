import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren } from 'claude-code'

import type { RadarAgent, RadarCall, RadarDiffs, RadarFile, RadarTask } from '../types'
import { ACCENT, ACCENT_HI, BG, boardSvg, DIM, HAIR, SILK, SUB } from './board'
import { pretty } from './model-name'
import { planCells, planSvg, SEG_COLOR } from './plan'
import { agentName, type Lang, type Strings, t } from './i18n'
import { ERR, esc, groupAgents, KIND_COLOR, short, STATIONS } from './shared'

const PANE = 'radar'
const TITLE = 'Radar'
const MAIN = 'main'

const agents = atom({ plugin: 'radar', key: 'agents' } as const, [] as RadarAgent[], { shape: 'agents-1' })
const tasks = atom({ plugin: 'radar', key: 'tasks' } as const, [] as RadarTask[], { shape: 'tasks-1' })
// shortcut: usage counts come from the last 120 calls only; keep a counter atom if whole-session totals matter.
const calls = atom({ plugin: 'radar', key: 'calls' } as const, [] as RadarCall[], { shape: 'calls-2' })
const files = atom({ plugin: 'radar', key: 'files' } as const, [] as RadarFile[], { shape: 'files-1' })
// procs/files/det/tasks: first row shown; tasksFor: 'cur:<task>' the user scrolled Tasks under, else auto-follow; mark: newest call id when Calls was scrolled away from the top.
const scroll = atom({ plugin: 'radar', key: 'scroll' } as const, { procs: 0, files: 0, det: 0, mark: '', tasks: 0, tasksFor: '' }, { shape: 'scroll-3' })
// Last model each loop asked, keyed by agentId ('main' for the main loop).
const models = atom({ plugin: 'radar', key: 'models' } as const, {} as Record<string, string>, { shape: 'models-1' })
const diffs = atom({ plugin: 'radar', key: 'diffs' } as const, {} as RadarDiffs, { shape: 'diffs-1' })
// File whose diff the Files box shows; '' shows the tree.
const open = atom({ plugin: 'radar', key: 'open' } as const, { path: '' }, { shape: 'open-1' })
// Which drawing the Agents box shows on graphic surfaces.
const view = atom({ plugin: 'radar', key: 'view' } as const, { graph: 'board' as 'board' | 'radar' }, { shape: 'view-1' })

// Folded boxes show only their header row.
const fold = atom({ plugin: 'radar', key: 'fold' } as const, { graph: false, tabs: false }, { shape: 'fold-3' })
// Calls whose detail Calls shows, latest first; [] shows the feed.
const pick = atom({ plugin: 'radar', key: 'pick' } as const, { ids: [] as string[] }, { shape: 'pick-1' })
// agent '' = every agent.
const filter = atom({ plugin: 'radar', key: 'filter' } as const, { errors: false, agent: '' }, { shape: 'filter-1' })
// When the current plan task became current.
const since = atom({ plugin: 'radar', key: 'since' } as const, { content: '', at: 0 }, { shape: 'since-1' })
// UI language; the stored choice ($.store 'lang') is loaded at session.start. Defaults to English.
const lang = atom({ plugin: 'radar', key: 'lang' } as const, { l: 'en' as Lang }, { shape: 'lang-1' })
// Tab the lower box shows.
type Tab = 'tasks' | 'procs' | 'files'
const TABS: readonly Tab[] = ['tasks', 'procs', 'files']
const tab = atom({ plugin: 'radar', key: 'tab' } as const, { tab: 'procs' as Tab }, { shape: 'tab-1' })
// Graph box share of the pane: large, balanced, small; i indexes SIZES.
const SIZES = [0.6, 0.4, 0.25] as const
const size = atom({ plugin: 'radar', key: 'size' } as const, { i: 1 }, { shape: 'size-1' })
const FOLD_H = 3
const MIN_H = 6
/** Rows of the graph box and the tabs box: a folded box takes 3, the other the rest; open ones split by share. */
export function heights(rows: number, share: number, graphFolded: boolean, tabsFolded: boolean): [number, number] {
  if (graphFolded || tabsFolded) return [graphFolded ? FOLD_H : Math.max(MIN_H, rows - FOLD_H), tabsFolded ? FOLD_H : Math.max(MIN_H, rows - FOLD_H)]
  const g = Math.max(MIN_H, Math.min(rows - MIN_H, Math.round(rows * share)))
  return [g, Math.max(MIN_H, rows - g)]
}

const DIFF_LINES = 400
const DIFF_FILES = 40
type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

function diffOf(result: unknown, content: string, op: RadarFile['op']): string[] {
  const hunks = (result as { structuredPatch?: Hunk[] } | undefined)?.structuredPatch ?? []
  if (hunks.length) return hunks.flatMap(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines])
  // A new file comes back with no patch: all of it is added.
  return op === 'create' && content ? content.split('\n').map(l => '+' + l) : []
}

function addDiff(all: RadarDiffs, path: string, lines: string[]): RadarDiffs {
  const { [path]: old = [], ...rest } = all
  const keys = Object.keys(rest)
  for (const k of keys.slice(0, Math.max(0, keys.length - (DIFF_FILES - 1)))) delete rest[k]
  return { ...rest, [path]: [...old, ...lines].slice(-DIFF_LINES) }
}


type Args = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const norm = (p: string) => p.replace(/\\/g, '/')
const dur = (ms?: number) => (ms === undefined ? '…' : ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`)

// Added lines and created files: mint-teal; deleted lines keep the error rose.
const ADD = '#5eead4'
const OP = {
  read: { icon: '👁', color: '#60a5fa', rank: 0 },
  edit: { icon: '✎', color: '#a78bfa', rank: 1 },
  create: { icon: '✚', color: ADD, rank: 2 },
} as const

function classify(tool: string, a: Args): Pick<RadarCall, 'kind' | 'target'> {
  if (tool === 'Skill') return { kind: 'skill', target: str(a.skill) }
  if (tool === 'Agent' || tool === 'Task') return { kind: 'agent', target: str(a.subagent_type) || str(a.description) }
  if (tool.startsWith('mcp__plugin_')) return { kind: 'plugin', target: tool.split('__').slice(1).join(' › ') }
  if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__')
    return { kind: 'mcp', target: `${server.slice(0, 12)} › ${name}` }
  }
  if (tool === 'WebFetch' || tool === 'WebSearch') return { kind: 'web', target: str(a.url) || str(a.query) }
  const cmd = str(a.command)
  if (/\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b|webhook/i.test(cmd)) return { kind: 'webhook', target: cmd }
  return {
    kind: 'tool',
    target: str(a.file_path) || str(a.notebook_path) || str(a.pattern) || cmd || str(a.path) || str(a.description),
  }
}

// Plan tools: the desktop app's update_plan, and TodoWrite.
function nextTasks(tool: string, a: Args, list: RadarTask[]): RadarTask[] | undefined {
  if (tool === 'TodoWrite' && Array.isArray(a.todos)) return (a.todos as Args[]).map(t => ({ content: str(t.content), status: str(t.status) }))
  if (!tool.endsWith('update_plan')) return undefined
  if (Array.isArray(a.items)) return (a.items as Args[]).map(t => ({ content: str(t.content), status: str(t.status) }))
  const out = list.map(t => ({ ...t }))
  const cur = out.find(t => t.status === 'in_progress')
  if (a.advance === true) {
    if (cur) cur.status = 'completed'
    const nxt = out.find(t => t.status === 'pending')
    if (nxt) nxt.status = 'in_progress'
  }
  if (Array.isArray(a.done)) for (const n of a.done as number[]) { const t = out[n - 1]; if (t) t.status = 'completed' }
  const started = typeof a.start === 'number' ? out[a.start - 1] : undefined
  if (started) {
    if (cur && cur.status === 'in_progress') cur.status = 'pending'
    started.status = 'in_progress'
  }
  return out
}

function touch(list: RadarFile[], path: string, op: RadarFile['op']): RadarFile[] {
  const old = list.find(f => f.path === path)
  if (!old) return [...list, { path, op }].slice(-300)
  return OP[op].rank > OP[old.op].rank ? list.map(f => (f.path === path ? { path, op } : f)) : list
}

// ---------- section 1: animated agent graph (SVG + SMIL) ----------
export function graphSvg(list: RadarAgent[], cls: RadarCall[], mainModel: string, s: Strings): string {
  const W = 400, H = 330, cx = 200, cy = 158, RA = 74, RS = 128
  const live = cls.filter(c => c.status === 'run')
  const p: string[] = []
  p.push(`<defs>
<radialGradient id="core" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#256fa5"/><stop offset="60%" stop-color="#17507a"/><stop offset="100%" stop-color="#0b2233"/></radialGradient>
<radialGradient id="sub" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#a5f3fc"/><stop offset="100%" stop-color="#0e7490"/></radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`)
  // radar sweep
  const sx = cx + (RS + 6) * Math.sin(0.6), sy = cy - (RS + 6) * Math.cos(0.6)
  p.push(`<circle cx="${cx}" cy="${cy}" r="${RS}" fill="none" stroke="#334155" stroke-opacity=".35"/>
<circle cx="${cx}" cy="${cy}" r="${RA}" fill="none" stroke="#334155" stroke-opacity=".25"/>
<path d="M${cx},${cy} L${cx},${cy - RS - 6} A${RS + 6},${RS + 6} 0 0,1 ${sx.toFixed(1)},${sy.toFixed(1)} Z" fill="${ACCENT}" fill-opacity=".09">
<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="6s" repeatCount="indefinite"/></path>`)

  // outer stations: spokes thicken with use, pulses fly to the live ones, red dot on errors
  STATIONS.forEach((st, i) => {
    const ang = (i / STATIONS.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / STATIONS.length
    const x = cx + RS * Math.cos(ang), y = cy + RS * Math.sin(ang)
    const used = cls.filter(c => c.kind === st.kind)
    const n = used.length
    const errs = used.filter(c => c.status === 'error').length
    const running = live.filter(c => c.kind === st.kind).length
    const col = KIND_COLOR[st.kind]
    const id = `s${i}`
    p.push(`<path id="${id}" d="M${cx},${cy} L${x.toFixed(1)},${y.toFixed(1)}" stroke="${col}" stroke-opacity="${n ? 0.25 + Math.min(n, 20) / 40 : 0.08}" stroke-width="${(0.6 + Math.min(n, 24) / 6).toFixed(1)}" stroke-linecap="round" fill="none"/>`)
    for (let k = 0; k < Math.min(running, 3); k++)
      p.push(`<circle r="4.5" fill="${col}" filter="url(#glow)"><animateMotion dur="1.1s" begin="${(k * 0.35).toFixed(2)}s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>`)
    if (running) p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="none" stroke="${col}"><animate attributeName="r" values="7;15;7" dur="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/></circle>`)
    p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${n ? col : '#1e293b'}" stroke="${col}"/>`)
    const below = y > cy + 5
    const ly = y + (below ? 22 : -13)
    p.push(`<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="13" fill="${n ? '#e2e8f0' : '#64748b'}" font-family="sans-serif">${esc(s.station[st.kind])}${running > 1 ? ` ×${running}` : n ? ` ${n}` : ''}</text>`)
    if (errs) p.push(`<circle cx="${(x + 9).toFixed(1)}" cy="${(y - 8).toFixed(1)}" r="7" fill="${ERR}"/><text x="${(x + 9).toFixed(1)}" y="${(y - 4.5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#fff" font-family="sans-serif">${errs}</text>`)
  })

  // inner ring: subagents talking with the main agent
  const shown = groupAgents(list)
  shown.forEach(({ ag, n }, i) => {
    const ang = (i / Math.max(shown.length, 1)) * Math.PI * 2 - Math.PI / 2
    const x = cx + RA * Math.cos(ang), y = cy + RA * Math.sin(ang)
    const id = `l${i}`
    const run = !ag.isDone
    p.push(`<path id="${id}" d="M${x.toFixed(1)},${y.toFixed(1)} L${cx},${cy}" stroke="${run ? '#22d3ee' : '#475569'}" stroke-width="${run ? 2 : 1}" stroke-dasharray="4 4" fill="none" opacity="${run ? 0.9 : 0.4}">${
      run ? `<animate attributeName="stroke-dashoffset" from="16" to="0" dur=".8s" repeatCount="indefinite"/>` : ''
    }</path>`)
    if (run) {
      // reports flow to the main agent, orders flow back
      for (const [d, begin, color, rev] of [['1.4s', '0s', '#67e8f9', false], ['1.4s', '.7s', '#67e8f9', false], ['2s', '.3s', ACCENT_HI, true]] as const)
        p.push(`<circle r="3.5" fill="${color}" filter="url(#glow)"><animateMotion dur="${d}" begin="${begin}" repeatCount="indefinite"${rev ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}><mpath href="#${id}"/></animateMotion></circle>`)
      p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="none" stroke="#22d3ee"><animate attributeName="r" values="14;22;14" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0;.8" dur="1.6s" repeatCount="indefinite"/></circle>`)
    }
    p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${run ? 'url(#sub)' : '#334155'}" stroke="${run ? '#a5f3fc' : '#64748b'}"/>
<text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle" font-size="12" fill="#f8fafc" font-family="sans-serif">${run ? '⚙' : n > 1 ? `×${n}` : '✓'}</text>
<text x="${x.toFixed(1)}" y="${(y + (y >= cy ? 27 : -31)).toFixed(1)}" text-anchor="middle" font-size="12" fill="${run ? '#e2e8f0' : '#94a3b8'}" font-family="sans-serif">${esc(short(ag.type, n > 1 ? 14 : 18) + (n > 1 ? ` ×${n}` : ''))}</text>
<text x="${x.toFixed(1)}" y="${(y + (y >= cy ? 40 : -18)).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="bold" fill="${run ? '#c4b5fd' : '#7c7a99'}" font-family="sans-serif">${esc(pretty(ag.model))}</text>`)
  })

  // main agent: rotating rings + breathing core
  const busy = live.length > 0
  p.push(`<circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="10 6"><animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${busy ? 3 : 10}s" repeatCount="indefinite"/></circle>
<circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="${ACCENT_HI}" stroke-opacity=".5" stroke-dasharray="2 8"><animateTransform attributeName="transform" type="rotate" from="360 ${cx} ${cy}" to="0 ${cx} ${cy}" dur="14s" repeatCount="indefinite"/></circle>
<circle cx="${cx}" cy="${cy}" r="30" fill="url(#core)" filter="url(#glow)"><animate attributeName="r" values="29;32;29" dur="${busy ? 1.2 : 2.6}s" repeatCount="indefinite"/></circle>
<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff" font-family="sans-serif">${esc(short(pretty(mainModel), 11))}</text>
<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="10" fill="#a5e8ff" font-family="sans-serif">${s.main}</text>`)
  const now = live[live.length - 1]
  if (now) {
    const c = KIND_COLOR[now.kind]
    p.push(`<rect x="${cx - 150}" y="${H - 24}" width="300" height="21" rx="10.5" fill="${c}" fill-opacity=".18" stroke="${c}"/>
<text x="${cx}" y="${H - 9}" text-anchor="middle" font-size="13" fill="${c}" font-family="sans-serif">${esc(short(`● ${agentName(s, now.agent)} (${pretty(now.model)}) → ${now.kind === 'mcp' || now.kind === 'plugin' ? now.target : now.tool}`, 44))}</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 3}" height="${H * 3}">${p.join('')}</svg>`
}

// ---------- section 2: feed rows, consecutive finished calls of one tool folded ----------
type Row = { call: RadarCall; more: number; ids: string[] }
function feed(list: RadarCall[]): Row[] {
  const rows: Row[] = []
  for (const c of list) {
    const last = rows[rows.length - 1]
    if (last && c.status === 'done' && last.call.status === 'done' && last.call.tool === c.tool && last.call.agent === c.agent && last.call.model === c.model) {
      last.more++
      last.ids.push(c.id)
      last.call = { ...c, ms: (last.call.ms ?? 0) + (c.ms ?? 0) }
    } else rows.push({ call: c, more: 0, ids: [c.id] })
  }
  return rows
}


// ---------- section 3: tree of touched files ----------
type Leaf = RadarFile & { full: string }
type Node = { dirs: Map<string, Node>; files: Leaf[]; hot: number }

function buildTree(list: RadarFile[]): { root: string; node: Node } {
  const split = list.map(f => norm(f.path).split('/'))
  let common = split[0]?.slice(0, -1) ?? []
  for (const s of split) {
    let i = 0
    while (i < common.length && i < s.length - 1 && common[i]?.toLowerCase() === s[i]?.toLowerCase()) i++
    common = common.slice(0, i)
  }
  const node: Node = { dirs: new Map(), files: [], hot: -1 }
  list.forEach((f, k) => {
    const segs = (split[k] ?? []).slice(common.length)
    let n = node
    n.hot = Math.max(n.hot, OP[f.op].rank)
    for (const d of segs.slice(0, -1)) {
      if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), files: [], hot: -1 })
      n = n.dirs.get(d)!
      n.hot = Math.max(n.hot, OP[f.op].rank)
    }
    n.files.push({ path: segs[segs.length - 1] ?? f.path, op: f.op, full: f.path })
  })
  return { root: common.join('/') || '/', node }
}

type Line = { indent: string; text: string; color?: string; dim?: boolean; bold?: boolean; full?: string }

function treeLines(n: Node, indent: string, out: Line[]) {
  const dirs = [...n.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))
  const items: ([string, Node] | Leaf)[] = [...dirs, ...n.files.sort((a, b) => a.path.localeCompare(b.path))]
  items.forEach((it, i) => {
    const last = i === items.length - 1
    const branch = indent + (last ? '└ ' : '├ ')
    const nextIndent = indent + (last ? '  ' : '│ ')
    if (Array.isArray(it)) {
      let [name, child] = it
      // fold single-folder chains: a/b/c
      while (child.files.length === 0 && child.dirs.size === 1) {
        const [sub, deeper] = [...child.dirs.entries()][0]!
        name += '/' + sub
        child = deeper
      }
      const hot = child.hot >= 1
      out.push({ indent: branch, text: `${hot ? '📂' : '📁'} ${name}`, color: hot ? (child.hot === 2 ? OP.create.color : OP.edit.color) : undefined, dim: !hot, bold: hot })
      treeLines(child, nextIndent, out)
    } else {
      out.push({ indent: branch, text: `${OP[it.op].icon} ${it.path}`, color: OP[it.op].color, full: it.full })
    }
  })
}


const plusMinus = (lines: string[] | undefined) => {
  let a = 0, d = 0
  for (const l of lines ?? []) if (l.startsWith('+')) a++; else if (l.startsWith('-')) d++
  return { a, d }
}
const clock = (at: number) => new Date(at).toTimeString().slice(0, 8)
// Hard wrap: every chunk one row, so windowing counts rows right.
const wrap = (s: string, w: number) => s.split('\n').flatMap(l => (l.length ? Array.from({ length: Math.ceil(l.length / w) }, (_, i) => l.slice(i * w, (i + 1) * w)) : ['']))
const errOf = (ran: { deny?: string; isError?: true; text?: string; result?: unknown }) =>
  (ran.deny ?? (ran.text || (typeof ran.result === 'string' ? ran.result : ''))).slice(0, ERR_CHARS)
const ERR_CHARS = 600
const OPEN = { id: PANE, title: TITLE, backgroundColor: BG }
// Controls are filled pills: cold slate at rest, accent when on; the selected tab and its strip share TAB.
const CHIP = '#34404a', CHIP_INK = '#d5e3ee', CHIP_DIM = '#9fb2c2', INK = '#0b1d28', TAB = '#1f5f86'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('lang').catch(() => undefined)
    await update($, lang, () => ({ l: stored === 'es' ? 'es' : 'en' }))
    await $.command.register({ name: 'radar', description: t(stored === 'es' ? 'es' : 'en').cmdDesc })
    void $.ui.open(OPEN)
    return next(e)
  })

  on('command.run', { command: 'radar' }, async $ => {
    await $.ui.open(OPEN)
    return { text: t((await read($, lang)).l).opened }
  })

  // Every model request names its model and loop: that is "which AI is working".
  on('turn.step', async function* ($, e, next) {
    const key = e.agentId ?? 'main'
    const seen = await read($, models)
    if (seen[key] !== e.model) {
      await update($, models, m => ({ ...m, [key]: e.model }))
      if (e.agentId) await update($, agents, list => list.map(x => (x.id === e.agentId ? { ...x, model: e.model } : x)))
    }
    return yield* next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const calls0 = await read($, calls)
    const pending = [...calls0].reverse().find(c => c.kind === 'agent' && c.status === 'run' && c.target === e.agent_type)
    await update($, agents, list =>
      list.some(a => a.id === e.agent_id)
        ? list
        : [...list, { id: e.agent_id, type: e.agent_type || 'agent', desc: pending?.target ?? '', isDone: false }].slice(-30),
    )
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await update($, agents, list => list.map(a => (a.id === e.agent_id ? { ...a, isDone: true, tool: undefined } : a)))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const a = e as unknown as Args
    const tool = String(e.tool)
    const agentList = await read($, agents)
    const who = e.agentId ? (agentList.find(x => x.id === e.agentId)?.type ?? 'subagent') : MAIN
    const model = (await read($, models))[e.agentId ?? 'main']
    const call: RadarCall = { id: e.tool_use_id, agent: who, model, tool, status: 'run', at: Date.now(), ...classify(tool, a) }

    await update($, calls, list => [...list, call].slice(-120))
    if (e.agentId) await update($, agents, list => list.map(x => (x.id === e.agentId ? { ...x, tool } : x)))
    const planned = nextTasks(tool, a, await read($, tasks))
    if (planned) {
      await update($, tasks, () => planned)
      const cur = planned.find(t => t.status === 'in_progress')?.content ?? ''
      await update($, since, s => (s.content === cur ? s : { content: cur, at: Date.now() }))
    }

    const path = str(a.file_path) || str(a.notebook_path)
    let op: RadarFile['op'] | undefined
    if (path) {
      if (tool === 'Read') op = 'read'
      else if (tool === 'Edit' || tool === 'NotebookEdit') op = 'edit'
      else if (tool === 'Write') {
        try {
          await $.fs.stat(path)
          op = 'edit'
        } catch {
          op = 'create'
        }
      }
    }

    const ran = await next(e)
    const failed = 'deny' in ran && ran.deny !== undefined ? true : Boolean(ran.isError)
    const ms = Date.now() - call.at
    const err = failed ? errOf(ran) : undefined
    // The desktop app closes the turn's plan with wrap_up, not with a last update_plan.
    if (!failed && tool.endsWith('wrap_up')) {
      await update($, tasks, list => list.map(t => ({ ...t, status: 'completed' })))
      await update($, since, () => ({ content: '', at: 0 }))
    }
    await update($, calls, list => list.map(c => (c.id === call.id ? { ...c, status: failed ? ('error' as const) : ('done' as const), ms, ...(err ? { err } : {}) } : c)))
    if (path && op && !failed) await update($, files, list => touch(list, norm(path), op!))
    if (path && op && op !== 'read' && !failed && 'result' in ran) {
      const lines = diffOf(ran.result, str(a.content), op)
      if (lines.length) await update($, diffs, all => addDiff(all, norm(path), lines))
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const [ags, tks, cls, fls, mdl, dfs, opened, vw, sc, fd, pk, flt, snc, tb, sz, lg] = await Promise.all([
      read($, agents), read($, tasks), read($, calls), read($, files), read($, models), read($, diffs), read($, open), read($, view),
      read($, scroll), read($, fold), read($, pick), read($, filter), read($, since), read($, tab), read($, size), read($, lang),
    ])
    const s = t(lg.l)
    const chip = (key: string, label: string, onPress: () => Promise<unknown>, lit = false) => (
      <Box backgroundColor={lit ? ACCENT : CHIP} paddingX={1}>
        <Button key={key} plain label={label} onPress={onPress}><Text bold={lit} color={lit ? INK : CHIP_INK}>{label}</Text></Button>
      </Box>
    )
    const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 40
    const inner = Math.max(10, cols - 4)
    const live = cls.filter(c => c.status === 'run')
    const mainModel = mdl.main ?? ''
    // The table names keys a surface lacks, so ask the surface, not the table.
    const vector = e.surface !== 'terminal' && 'Svg' in ui ? ui : undefined

    const bodyRows = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 45
    const [hA, hB] = heights(bodyRows, SIZES[sz.i] ?? SIZES[1], fd.graph, fd.tabs)
    const cur = TABS.includes(tb.tab) ? tb.tab : 'procs'
    // Tab body rows: border, tab bar and sub-header take 4.
    const win = Math.max(1, hB - 4)
    const gRows = Math.max(1, hA - 3)

    // ---------- 1. agents ----------
    const graph = (
      <Box flexDirection="column">
        <Text bold color={ACCENT}>◉ {pretty(mainModel)} · {s.mainDecides}</Text>
        {groupAgents(ags).map(({ ag: x, n }) => (
          <Text color={x.isDone ? DIM : SUB} maxLines={1}>
            {x.isDone ? '  ✓ ' : '  ⇄ '}
            {x.type}{n > 1 ? ` ×${n}` : ''} <Text color={x.isDone ? DIM : SILK}>({pretty(x.model)})</Text>
            {!x.isDone && x.tool ? ` · ${x.tool}` : ''}
          </Text>
        ))}
      </Box>
    )
    // Box content is cols-4 wide (border + padding). shortcut: 7.5px per column is a low guess so the
    // board errs narrower than the box: full height, any side margin is full-bleed substrate; use the real slot width if the host ever reports it.
    const boardAspect = (inner * 7.5) / (gRows * 18)
    const graphBox = vector ? (
      <vector.Svg source={vw.graph === 'radar' ? graphSvg(ags, cls, mainModel, s) : boardSvg(ags, cls, mainModel, boardAspect, s)} alt={s.graphAlt(pretty(mainModel), ags.filter(x => !x.isDone).length, live.length)} isInteractive height={gRows * 18} />
    ) : graph
    // Only graphic surfaces draw the SVG, so only they get the switch.
    const toggle = graphBox !== graph ? (
      chip('graph-toggle', vw.graph === 'radar' ? `⇄ ${s.board}` : '⇄ Radar', () => update($, view, v => ({ graph: v.graph === 'radar' ? ('board' as const) : ('radar' as const) })))
    ) : undefined

    // ---------- 2. tasks ----------
    const doneN = tks.filter(t => t.status === 'completed').length
    const current = tks.find(t => t.status === 'in_progress')
    const pct = tks.length ? Math.round((doneN / tks.length) * 100) : 0
    const figure = ` ${doneN}/${tks.length} · ${pct}%`
    const barW = Math.max(4, inner - figure.length)
    const elapsed = current && snc.content === current.content ? ` · ${dur(Date.now() - snc.at)}` : ''
    const plan = !tks.length ? [<Text color={DIM} maxLines={1}>{s.noPlan}</Text>] : [
          <Box flexDirection="row">
            {vector ? (
              <vector.Svg source={planSvg(tks, barW * 7.5)} alt={s.planAlt(doneN, tks.length)} isInteractive height={10} />
            ) : (
              <Text maxLines={1}>{planCells(tks, barW).map(([s, k]) => <Text color={SEG_COLOR[k]}>{s}</Text>)}</Text>
            )}
            <Text color={SILK} maxLines={1}>{figure}</Text>
          </Box>,
          ...(doneN === tks.length ? [<Text color={DIM} maxLines={1}>{s.planDone}</Text>] : []),
        ]
    const MARK: Record<string, [string, string]> = { completed: ['✓', DIM], in_progress: ['▶', ACCENT] }
    const taskLines = tks.map(t => {
      const [m, c] = MARK[t.status] ?? ['○', SILK]
      return <Text color={c} maxLines={1}>{m} {t.content}{t === current ? <Text color={DIM}>{elapsed}</Text> : ''}</Text>
    })
    const taskWin = Math.max(1, win - plan.length)
    const taskMax = Math.max(0, tks.length - taskWin)
    // Follows the current task until the user scrolls; a new current task follows again.
    const curKey = `cur:${current?.content ?? ''}`
    const ci = current ? tks.indexOf(current) : tks.length - 1
    const taskOff = Math.max(0, Math.min(taskMax, sc.tasksFor === curKey ? sc.tasks : ci - Math.floor(taskWin / 2)))

    // ---------- 3. calls ----------

    const agentsSeen = ['', MAIN, ...new Set(cls.map(c => c.agent).filter(x => x !== MAIN))]
    const shown = cls.filter(c => (!flt.errors || c.status === 'error') && (!flt.agent || c.agent === flt.agent))
    // Newest first: offset 0 is the newest row and follows new ones.
    const rows = feed(shown).reverse()
    const newest = rows[0]?.ids[rows[0].ids.length - 1] ?? ''
    // Scrolled away: the view stays on the rows it showed, and counts the rows that came in above.
    const nNew = sc.procs > 0 && sc.mark ? Math.max(0, rows.findIndex(r => r.ids.includes(sc.mark))) : 0
    const picked = pk.ids.map(id => cls.find(c => c.id === id)).filter((c): c is RadarCall => !!c)
    const inDetail = pk.ids.length > 0
    const procWin = Math.max(1, win - 1)
    const procMax = Math.max(0, rows.length - procWin)
    const procOff = Math.min(sc.procs + nNew, procMax)
    const pickRow = (r: Row) => async () => {
      await update($, pick, () => ({ ids: [...r.ids].reverse() }))
      await update($, scroll, s => ({ ...s, det: 0 }))
    }
    const feedLines = rows.map(r => {
      const c = r.call
      const fin = c.status === 'done'
      return (
        <Button key={`proc:${c.id}`} plain onPress={pickRow(r)}>
          <Text maxLines={1} color={fin ? DIM : SILK}>
            <Text color={c.status === 'error' ? ERR : c.status === 'run' ? ACCENT : DIM}>{c.status === 'run' ? '●' : c.status === 'error' ? '✕' : '·'}</Text>{' '}
            <Text color={KIND_COLOR[c.kind]}>[{c.kind}]</Text> {c.kind === 'mcp' || c.kind === 'plugin' ? c.target : c.tool}
            {r.more ? <Text color={DIM}> +{r.more}</Text> : ''}
            <Text color={DIM}> · {agentName(s, c.agent)}</Text>
            <Text color={fin ? DIM : SILK}> {pretty(c.model)}</Text>
            {c.target && c.kind !== 'mcp' && c.kind !== 'plugin' ? <Text color={DIM}> · {short(norm(c.target).split('/').pop() ?? '', 24)}</Text> : ''}
            <Text color={DIM}> {dur(c.ms)}</Text>
          </Text>
        </Button>
      )
    })
    const kv = (k: string, v: RenderChildren, color: string = SILK) => (
      <Text maxLines={1}><Text color={DIM}>{k.padEnd(12)}</Text><Text color={color}>{v}</Text></Text>
    )
    const label = (t: string, color: string = DIM) => <Text bold color={color} maxLines={1}>{t}</Text>
    const top = picked[0]
    const detailLines = !top
      ? [<Text color={DIM}>{s.gone}</Text>]
      : [
          kv(s.fTool, top.tool),
          kv(s.fType, `[${top.kind}]`, KIND_COLOR[top.kind]),
          kv(s.fAgent, agentName(s, top.agent)),
          kv(s.fModel, pretty(top.model)),
          kv(s.fStart, clock(top.at)),
          kv(s.fDur, dur(top.ms)),
          kv(s.fStatus, s.status[top.status], top.status === 'error' ? ERR : top.status === 'run' ? ACCENT : SILK),
          label(s.target),
          ...(top.target ? wrap(top.target, inner).map(l => <Text color={SILK} maxLines={1}>{l}</Text>) : [<Text color={DIM}>—</Text>]),
          ...(top.err ? [label(s.error, ERR), ...wrap(top.err, inner).map(l => <Text color={ERR} maxLines={1}>{l}</Text>)] : []),
          ...(picked.length > 1
            ? [label(s.folded(picked.length - 1)), ...picked.slice(1).map(c => <Text color={DIM} maxLines={1}>· {clock(c.at)} {dur(c.ms)} {short(norm(c.target), inner - 20)}</Text>)]
            : []),
        ]
    const detMax = Math.max(0, detailLines.length - procWin)
    const detOff = Math.min(sc.det, detMax)

    const setFilter = (fn: (f: { errors: boolean; agent: string }) => { errors: boolean; agent: string }) => async () => {
      await update($, filter, fn)
      await update($, scroll, s => ({ ...s, procs: 0, mark: '' }))
    }
    const fltRow = (
      <Box flexDirection="row" gap={1}>
        {chip('flt-err', `${flt.errors ? '●' : '○'} ${s.errOnly}`, setFilter(f => ({ ...f, errors: !f.errors })), flt.errors)}
        {chip('flt-agent', s.agentF(flt.agent ? agentName(s, flt.agent) : s.all), setFilter(f => {
          const i = agentsSeen.indexOf(f.agent)
          return { ...f, agent: i < 0 ? '' : agentsSeen[(i + 1) % agentsSeen.length] ?? '' }
        }), flt.agent !== '')}
        {procOff > 0 ? chip('procs-latest', nNew ? `● ${s.nNew(nNew)} · ${s.latest}` : s.latest, () => update($, scroll, s => ({ ...s, procs: 0, mark: '' })), nNew > 0) : ''}
      </Box>
    )

    // ---------- 4. files ----------
    const lines: Line[] = []
    let root = ''
    if (fls.length) {
      const t = buildTree(fls)
      root = t.root
      treeLines(t.node, '', lines)
    }
    const nEdit = fls.filter(f => f.op === 'edit').length
    const nNew2 = fls.filter(f => f.op === 'create').length
    // Opening or closing a diff starts its box at the top.
    const show = (path: string) => async () => {
      await update($, open, () => ({ path }))
      await update($, scroll, s => ({ ...s, files: 0 }))
    }
    const diff = opened.path ? dfs[opened.path] : undefined
    const DIFF_COLOR = (l: string) => (l.startsWith('@@') ? '#c4b5fd' : l.startsWith('+') ? ADD : l.startsWith('-') ? ERR : DIM)
    const pm = ({ a, d }: { a: number; d: number }) => [<Text color={ADD}>+{a}</Text>, ' ', <Text color={ERR}>−{d}</Text>]
    const fileLines = diff
      ? diff.map(l => <Text maxLines={1} color={DIFF_COLOR(l)}>{short(l, inner)}</Text>)
      : fls.length === 0
        ? [<Text color={DIM}>{s.noFiles}</Text>]
        : [
            <Text color={DIM} maxLines={1}>{short(root, inner)}</Text>,
            ...lines.map(l =>
              l.full && dfs[l.full] ? (
                <Box flexDirection="row">
                  <Text color={HAIR}>{l.indent}</Text>
                  <Button key={`diff:${l.full}`} plain onPress={show(l.full)}>
                    <Text maxLines={1} color={l.color}><Text underline>{l.text}</Text> {pm(plusMinus(dfs[l.full]))}</Text>
                  </Button>
                </Box>
              ) : (
                <Text maxLines={1} color={l.dim ? DIM : l.color} bold={l.bold}>
                  <Text color={HAIR}>{l.indent}</Text>
                  {l.text}
                </Text>
              ),
            ),
          ]
    const fileWin = Math.max(1, win - 1)
    const fileMax = Math.max(0, fileLines.length - fileWin)
    const fileOff = Math.min(sc.files, fileMax)

    const procsBody = inDetail ? (
      <Box flexDirection="column">
        <Box flexDirection="row">{chip('proc-back', s.back, () => update($, pick, () => ({ ids: [] })))}</Box>
        {detailLines.slice(detOff, detOff + procWin)}
      </Box>
    ) : (
      <Box flexDirection="column">
        {fltRow}
        {rows.length === 0
          ? <Text color={DIM}>{cls.length ? s.noMatch : s.nothing}</Text>
          : feedLines.slice(procOff, procOff + procWin)}
      </Box>
    )

    const filesBody = (
      <Box flexDirection="column">
        {diff ? (
          <Box flexDirection="row">{chip('diff-back', s.backTree, show(''))}</Box>
        ) : (
          <Text color={DIM} maxLines={1}>
            <Text color={OP.read.color}>👁 {s.read}</Text> <Text color={OP.edit.color}>✎ {s.edited}</Text> <Text color={OP.create.color}>✚ {s.created}</Text> · {s.diffHint}
          </Text>
        )}
        {fileLines.slice(fileOff, fileOff + fileWin)}
      </Box>
    )

    // ---------- chrome: the board's language (hairline boxes, silkscreen headers) ----------
    type Scroll = { title: RenderChildren; total: number; win: number; off: number; k: 'tasks' | 'procs' | 'det' | 'files'; body: RenderChildren }
    const tabOf: Scroll =
      cur === 'tasks'
        ? { title: `J1 · ${s.tasks}`, total: tks.length, win: taskWin, off: taskOff, k: 'tasks', body: <Box flexDirection="column">{plan}{taskLines.slice(taskOff, taskOff + taskWin)}</Box> }
        : cur === 'procs'
          ? inDetail
            ? { title: `J2 · ${s.proc} · ${short(top?.tool ?? '', inner - 20)}`, total: detailLines.length, win: procWin, off: detOff, k: 'det', body: procsBody }
            : { title: `J2 · ${s.procs}`, total: rows.length, win: procWin, off: procOff, k: 'procs', body: procsBody }
          : {
              title: diff ? [`J3 · DIFF · ${short(norm(opened.path).split('/').pop() ?? '', inner - 26)} `, ...pm(plusMinus(diff))] : `J3 · ${s.files}`,
              total: fileLines.length, win: fileWin, off: fileOff, k: 'files', body: filesBody,
            }
    const { k, off } = tabOf
    const max = Math.max(0, tabOf.total - tabOf.win)
    const move = (by: number) => () =>
      update($, scroll, s => {
        const to = Math.max(0, Math.min(max, off + by))
        return k === 'procs' ? { ...s, procs: to, mark: to > 0 ? newest : '' } : k === 'tasks' ? { ...s, tasks: to, tasksFor: curKey } : { ...s, [k]: to }
      })
    const step = Math.max(1, tabOf.win - 1)

    const errN = cls.filter(c => c.status === 'error').length
    const BADGE: Record<Tab, RenderChildren> = {
      tasks: tks.length ? <Text color={SILK}> {doneN}/{tks.length}</Text> : '',
      procs: [live.length ? <Text color={ACCENT}> ●{live.length}</Text> : '', errN ? <Text color={ERR}> ✕{errN}</Text> : ''],
      files: nEdit + nNew2 ? <Text color={SILK}> {nEdit + nNew2}</Text> : '',
    }
    const NAME: Record<Tab, string> = { tasks: s.tasks, procs: s.procs, files: s.files }
    const tabBar = (
      <Box flexDirection="row" gap={1}>
        {chip('fold-tabs', fd.tabs ? '▸' : '▾', () => update($, fold, f => ({ ...f, tabs: !f.tabs })))}
        {TABS.map(t => (
          <Box backgroundColor={t === cur && !fd.tabs ? TAB : CHIP} paddingX={1}>
            <Button key={`tab-${t}`} plain onPress={() => update($, tab, () => ({ tab: t }))}>
              <Text maxLines={1}>
                <Text bold color={t === cur ? ACCENT_HI : CHIP_DIM}>{NAME[t]}</Text>
                {BADGE[t]}
              </Text>
            </Button>
          </Box>
        ))}
        <Box flexGrow={1} />
        {chip('size-cycle', '⇕', () => update($, size, s => ({ i: ((SIZES[s.i] !== undefined ? s.i : 1) + 1) % SIZES.length })))}
      </Box>
    )
    const subHeader = (
      <Box flexDirection="row" backgroundColor={TAB} paddingX={1} gap={1}>
        <Box flexGrow={1}>
          <Text bold color={ACCENT_HI} maxLines={1}>
            {tabOf.title}
            {max > 0 ? <Text color={CHIP_INK}>  {off + 1}–{Math.min(tabOf.total, off + tabOf.win)}/{tabOf.total}</Text> : ''}
          </Text>
        </Box>
        {max > 0 ? chip(`${k}-up`, '▲', move(-step)) : ''}
        {max > 0 ? chip(`${k}-down`, '▼', move(step)) : ''}
      </Box>
    )
    const frame = (rows: number, children: RenderChildren) => (
      <Box flexDirection="column" borderStyle="round" borderColor={HAIR} backgroundColor={BG} paddingX={1} height={rows} overflow="hidden">
        {children}
      </Box>
    )

    return (
      <Box flexDirection="column" backgroundColor={BG}>
        {frame(hA, [
          <Box flexDirection="row">
            {chip('fold-graph', fd.graph ? '▸' : '▾', () => update($, fold, f => ({ ...f, graph: !f.graph })))}
            <Text> </Text>
            <Box flexGrow={1}>
              <Text bold color={SILK} maxLines={1}><Text color={DIM}>U0 · </Text>{s.agents}</Text>
            </Box>
            {toggle ?? ''}
            <Text> </Text>
            {chip('lang-toggle', lg.l.toUpperCase(), async () => {
              const next: Lang = lg.l === 'es' ? 'en' : 'es'
              await $.store.set('lang', next)
              await update($, lang, () => ({ l: next }))
            })}
          </Box>,
          fd.graph ? '' : graphBox,
        ])}
        {frame(hB, [tabBar, ...(fd.tabs ? [] : [subHeader, tabOf.body])])}
      </Box>
    )
  })
}
