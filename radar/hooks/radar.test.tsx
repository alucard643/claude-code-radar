import type { TestBody } from 'claude-code/testing'
import { expect, mock, test as rawTest } from 'claude-code/testing'
import { boardSize, boardSvg } from './board'
import type { RadarAgent } from '../types'
import { T } from './i18n'
import { graphSvg, heights } from './register'
import { planCells, planSvg } from './plan'
import { pretty } from './model-name'
import { fmt } from './usage'

// The suite asserts the Spanish UI: every test starts with 'es' stored, as a user who picked it would.
const test = (name: string, body: TestBody) => rawTest(name, ($, on) => { mock.store(on, { lang: 'es' }); return body($, on) })

const PANE = {
  plugin: 'radar',
  component: 'Pane',
  requestId: 'radar',
  props: {
    title: 'Radar',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const
const SHORT = { ...PANE.props, scroll: { offset: 0, bodyRows: 17 } }

test('plan progress, tools and file tree render on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('fs.stat', () => {
    throw new Error('missing')
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'Uno', status: 'completed', activeForm: 'Uno' },
    { content: 'Dos', status: 'in_progress', activeForm: 'Dos' },
  ] })
  await $.tool.call({ tool: 'Read', file_path: 'C:\\p\\src\\a.ts' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\p\\src\\b.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\p\\docs\\new.md', content: 'hi' })
  await $.tool.call({ tool: 'Bash', command: 'curl https://hooks.example.test/x' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Only the selected tab's content is drawn.
    await ui.press({ key: 'tab-files' })
    expect((await ui.find({ type: 'Text', text: /✎ b\.ts/ }))?.text).toContain('b.ts')
    expect((await ui.find({ type: 'Text', text: /✚ new\.md/ }))?.text).toContain('new.md')
    expect((await ui.find({ type: 'Text', text: /👁 a\.ts/ }))?.text).toContain('a.ts')
    expect((await ui.find({ type: 'Text', text: /📂 src/ }))?.text).toContain('src')
    expect(await ui.find({ type: 'Text', text: /\[webhook\]/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /▶ Dos/ })).toBeFalsy()
    await ui.press({ key: 'tab-procs' })
    expect((await ui.find({ type: 'Text', text: /\[webhook\]/ }))?.text).toContain('webhook')
    expect(await ui.find({ type: 'Text', text: /✎ b\.ts/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /▶ Dos/ })).toBeFalsy()
    await ui.press({ key: 'tab-tasks' })
    expect((await ui.find({ type: 'Text', text: /▶ Dos/ }))?.text).toContain('Dos')
    expect(await ui.find({ type: 'Text', text: /\[webhook\]/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /✎ b\.ts/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('long file list scrolls inside its tab', async ($, on) => {
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 30; i++) await $.tool.call({ tool: 'Read', file_path: `/p/src/f${String(i).padStart(2, '0')}.ts` })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 36 } } })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: /👁 f00\.ts/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /👁 f29\.ts/ })).toBeFalsy()
  for (let i = 0; i < 10; i++) await ui.press({ key: 'files-down' })
  expect(await ui.find({ type: 'Text', text: /👁 f29\.ts/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /👁 f00\.ts/ })).toBeFalsy()
  await ui.unmount()
})

test('model ids read as family and version', async () => {
  expect(pretty('claude-opus-5-5')).toBe('Opus 5.5')
  expect(pretty('claude-fable-5-2[1m]')).toBe('Fable 5.2')
  expect(pretty('claude-haiku-5-5-20261001')).toBe('Haiku 5.5')
  expect(pretty('sonnet')).toBe('sonnet')
  expect(pretty(undefined)).toBe('?')
})

test('an edited file opens its diff and goes back to the tree', async ($, on) => {
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({
    result: { structuredPatch: [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-viejo', '+nuevo'] }] },
  }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/p/src/b.ts', old_string: 'viejo', new_string: 'nuevo' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: /✎ b\.ts \+1 −1/ })).toBeTruthy()
  await ui.press({ key: 'diff:/p/src/b.ts' })
  expect(await ui.find({ type: 'Text', text: /^\+nuevo$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^-viejo$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /@@ -3,1 \+3,1 @@/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /DIFF · b\.ts \+1 −1/ })).toBeTruthy()
  await ui.press({ key: 'diff-back' })
  expect(await ui.find({ type: 'Text', text: /^\+nuevo$/ })).toBeFalsy()
  await ui.unmount()
})

test('the Agentes box switches between board and radar on graphic surfaces', async ($, on) => {
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ key: 'graph-toggle' })).toBeFalsy()
  await term.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'graph-toggle' }))?.props.label).toBe('⇄ Radar')
  await ui.press({ key: 'graph-toggle' })
  expect((await ui.find({ key: 'graph-toggle' }))?.props.label).toBe('⇄ Placa')
  await ui.press({ key: 'graph-toggle' })
  expect((await ui.find({ key: 'graph-toggle' }))?.props.label).toBe('⇄ Radar')
  await ui.unmount()
})

test('board fills any box aspect at one text scale', async () => {
  expect(boardSize(2)).toEqual({ W: 660, H: 330 })
  expect(boardSize(0.8)).toEqual({ W: 400, H: 500 })
  expect(boardSize(Number.NaN)).toEqual({ W: 400, H: 330 })
  for (const a of [0.6, 1, 2.4]) {
    const svg = boardSvg([{ id: 'a', type: 'Explore', desc: '', isDone: false, model: 'claude-haiku-5-5' }], [], 'claude-opus-5-5', a)
    const { W, H } = boardSize(a)
    expect(svg).toContain(`viewBox="0 0 ${W} ${H}"`)
    expect(svg).not.toContain('NaN')
  }
})

const base = (on: Parameters<TestBody>[1]) => {
  on('command.register', () => ({ value: { command: 'radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}
const SURFACES = ['terminal', 'desktop'] as const
type Found = { key?: string; text: string; props: Record<string, unknown> }
type Finder = { findAll: (q: { type: 'Button' | 'Box' }) => Promise<Found[]> }
const procKey = async (ui: Finder, re: RegExp) => (await ui.findAll({ type: 'Button' })).find(b => b.key?.startsWith('proc:') && re.test(b.text))?.key
const procKeys = async (ui: Finder) => (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('proc:')).map(b => b.key)

test('a process row opens its detail, a failed one with its error, and goes back', async ($, on) => {
  base(on)
  on('tool.call', (_, e) => (e.tool === 'Bash' ? { isError: true as const, result: 'boom', text: 'Error: exit 1 boom' } : { result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const cmd = 'echo ' + 'x'.repeat(70) + ' END'
  await $.tool.call({ tool: 'Bash', command: cmd })
  await $.tool.call({ tool: 'Read', file_path: '/p/a.ts' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const key = await procKey(ui, /Bash/)
    expect(key).toBeTruthy()
    await ui.press({ key: key! })
    expect(await ui.find({ type: 'Text', text: /Error: exit 1 boom/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /PROCESO · Bash/ })).toBeTruthy()
    // Full command, wrapped over rows of the box width (46 here).
    expect(await ui.find({ type: 'Text', text: /^echo x{41}$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^x{29} END$/ })).toBeTruthy()
    await ui.press({ key: 'proc-back' })
    expect(await ui.find({ type: 'Text', text: /Error: exit 1 boom/ })).toBeFalsy()
    expect(await procKey(ui, /Read/)).toBeTruthy()
    await ui.unmount()
  }
})

test('a folded row shows its latest call and lists the rest', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const f of ['a', 'b', 'c']) await $.tool.call({ tool: 'Read', file_path: `/p/${f}.ts` })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: (await procKey(ui, /Read \+2/))! })
  expect(await ui.find({ type: 'Text', text: /^\/p\/c\.ts$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /2 MÁS PLEGADOS/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /\/p\/a\.ts$/ })).toBeTruthy()
  await ui.unmount()
})

test('errors-only and agent filters narrow the feed', async ($, on) => {
  base(on)
  on('tool.call', (_, e) => (e.tool === 'Bash' ? { isError: true as const, result: 'x', text: 'fail' } : { result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/p/a.ts' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Grep', pattern: 'q', agentId: 'sub1' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await procKey(ui, /Read/)).toBeTruthy()
    await ui.press({ key: 'flt-err' })
    expect(await procKey(ui, /Read/)).toBeFalsy()
    expect(await procKey(ui, /Bash/)).toBeTruthy()
    await ui.press({ key: 'flt-agent' })
    expect((await ui.find({ key: 'flt-agent' }))?.text).toContain('principal')
    expect(await procKey(ui, /Bash/)).toBeTruthy()
    await ui.press({ key: 'flt-agent' })
    expect((await ui.find({ key: 'flt-agent' }))?.text).toContain('subagente')
    expect(await ui.find({ type: 'Text', text: /Nada coincide con el filtro/ })).toBeTruthy()
    await ui.press({ key: 'flt-err' })
    expect(await procKey(ui, /Grep/)).toBeTruthy()
    expect(await procKey(ui, /Read/)).toBeFalsy()
    await ui.press({ key: 'flt-agent' })
    expect((await ui.find({ key: 'flt-agent' }))?.text).toContain('todos')
    expect(await procKey(ui, /Read/)).toBeTruthy()
    await ui.unmount()
  }
})

test('scrolled away, new calls show a jump back to the newest', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 30; i++) await $.tool.call({ tool: i % 2 ? 'Read' : 'Grep', file_path: `/p/f${i}.ts`, pattern: `p${i}` })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 36 } } })
  expect(await ui.find({ key: 'procs-latest' })).toBeFalsy()
  await ui.press({ key: 'procs-down' })
  expect((await ui.find({ key: 'procs-latest' }))?.text).toBe('ir a lo último')
  const before = await procKeys(ui)
  await $.tool.call({ tool: 'Glob', pattern: '**/*.zz' })
  await ui.redraw()
  expect((await ui.find({ key: 'procs-latest' }))?.text).toBe('● 1 nuevos · ir a lo último')
  // The view stays on the rows it showed.
  expect(await procKeys(ui)).toEqual(before)
  expect(await procKey(ui, /Glob/)).toBeFalsy()
  await ui.press({ key: 'procs-latest' })
  expect(await procKey(ui, /Glob/)).toBeTruthy()
  expect(await ui.find({ key: 'procs-latest' })).toBeFalsy()
  // At the newest, new rows follow in.
  await $.tool.call({ tool: 'WebSearch', query: 'zz', mode: 'standard' })
  await ui.redraw()
  expect(await procKey(ui, /WebSearch/)).toBeTruthy()
  await ui.unmount()
})

test('plan bar draws 0, 1 and 25 tasks within its width', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  const todos = (n: number, done: number) =>
    Array.from({ length: n }, (_, i) => ({ content: `T${i}`, status: (i < done ? 'completed' : i === done ? 'in_progress' : 'pending') as 'completed' | 'in_progress' | 'pending', activeForm: `T${i}` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-tasks' })
    expect(await ui.find({ type: 'Text', text: /SIN PLAN ACTIVO/ })).toBeTruthy()
    await ui.unmount()
  }
  for (const [n, done, fig] of [[1, 0, '0/1 · 0%'], [25, 3, '3/25 · 12%']] as const) {
    await $.tool.call({ tool: 'TodoWrite', todos: todos(n, done) })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'tab-tasks' })
      expect(await ui.find({ type: 'Text', text: new RegExp(fig) })).toBeTruthy()
      expect(await ui.find({ type: 'Text', text: new RegExp(`▶ T${done} · `) })).toBeTruthy()
      await ui.unmount()
    }
  }
  for (const n of [1, 7, 25, 60]) {
    const list = todos(n, Math.floor(n / 3)).map(({ content, status }) => ({ content, status }))
    for (const w of [40, 300]) {
      const svg = planSvg(list, w)
      expect(svg).not.toContain('NaN')
      for (const m of svg.matchAll(/<rect x="([\d.]+)"[^>]* width="([\d.]+)"/g)) expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(w + 0.01)
    }
    for (const w of [5, 12, 46]) expect(planCells(list, w).map(([s]) => s).join('').length).toBeLessThanOrEqual(w)
  }
  expect(planCells([], 10)).toEqual([])
})

test('Tareas lists every task, follows the current one and scrolls', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  const todos = (cur: number) =>
    Array.from({ length: 12 }, (_, i) => ({ content: `T${i}`, status: (i < cur ? 'completed' : i === cur ? 'in_progress' : 'pending') as 'completed' | 'in_progress' | 'pending', activeForm: `T${i}` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const [n, surface] of SURFACES.entries()) {
    // A new current task per surface: the scroll the previous surface left is the user's for the old one.
    const c = 5 + n, pct = Math.round((c / 12) * 100)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(c) })
    const ui = await $.ui.mount({ ...PANE, surface, props: SHORT })
    await ui.press({ key: 'tab-tasks' })
    expect(await ui.find({ type: 'Text', text: /J1 · TAREAS/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: new RegExp(`${c}/12 · ${pct}%`) })).toBeTruthy()
    // 17 rows: tabs box of 10, 5 list rows, centred on the current task, which carries its elapsed time.
    expect(await ui.find({ type: 'Text', text: new RegExp(`^▶ T${c} · `) })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: new RegExp(`^✓ T${c - 1}$`) })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: new RegExp(`^○ T${c + 1}$`) })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^✓ T0$/ })).toBeFalsy()
    await ui.press({ key: 'tasks-up' })
    await ui.press({ key: 'tasks-up' })
    expect(await ui.find({ type: 'Text', text: /^✓ T0$/ })).toBeTruthy()
    // The user's scroll holds over a redraw.
    await $.tool.call({ tool: 'Read', file_path: '/p/x.ts' })
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /^✓ T0$/ })).toBeTruthy()
    await ui.unmount()
  }
  // A new current task is followed again.
  await $.tool.call({ tool: 'TodoWrite', todos: todos(10) })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: SHORT })
  expect(await ui.find({ type: 'Text', text: /^▶ T10 · / })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^✓ T0$/ })).toBeFalsy()
  await ui.unmount()
})

const boxH = async (ui: Finder) => (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle === 'round').map(b => b.props.height)

test('tab badges count plan, running and failed calls, and touched files', async ($, on) => {
  base(on)
  let release = () => {}
  const gate = new Promise<void>(r => (release = r))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Glob') await gate
    return e.tool === 'Bash' ? { isError: true as const, result: 'x', text: 'fail' } : { result: {} }
  })
  on('fs.stat', () => {
    throw new Error('missing')
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'Uno', status: 'completed', activeForm: 'Uno' },
    { content: 'Dos', status: 'in_progress', activeForm: 'Dos' },
  ] })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Read', file_path: '/p/a.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/b.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Write', file_path: '/p/c.ts', content: 'hi' })
  const running = $.tool.call({ tool: 'Glob', pattern: '*' })
  for (let i = 0; i < 50; i++) await Promise.resolve()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Unselected tabs show an icon and their badge; the selected one its name.
    expect((await ui.find({ key: 'tab-tasks' }))?.text).toBe('☰ 1/2')
    expect((await ui.find({ key: 'tab-procs' }))?.text).toBe('PROCESOS ●1 ✕1')
    expect((await ui.find({ key: 'tab-files' }))?.text).toBe('▤ 2')
    await ui.press({ key: 'tab-files' })
    expect((await ui.find({ key: 'tab-files' }))?.text).toBe('ARCHIVOS 2')
    expect((await ui.find({ key: 'tab-procs' }))?.text).toBe('⇄ ●1 ✕1')
    await ui.press({ key: 'tab-procs' })
    // Folded, the tab bar keeps its badges.
    await ui.press({ key: 'fold-tabs' })
    expect((await ui.find({ key: 'tab-procs' }))?.text).toBe('PROCESOS ●1 ✕1')
    await ui.press({ key: 'fold-tabs' })
    await ui.unmount()
  }
  release()
  await running
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tab-procs' }))?.text).toBe('PROCESOS ✕1')
  await ui.unmount()
})

test('each tab keeps its own scroll across switches', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // 60 feed rows, 30 files.
  for (let i = 0; i < 60; i++) await $.tool.call({ tool: i % 2 ? 'Read' : 'Grep', file_path: `/p/f${String(i).padStart(2, '0')}.ts`, pattern: `p${i}` })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 36 } } })
    await ui.press({ key: 'tab-files' })
    await ui.press({ key: 'files-down' })
    const filesAt = (await ui.find({ type: 'Text', text: /J3 · ARCHIVOS/ }))?.text
    expect(filesAt).toContain('15–31/31')
    await ui.press({ key: 'tab-procs' })
    expect(await ui.find({ key: 'files-down' })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /J2 · PROCESOS {2}1–17\/60/ })).toBeTruthy()
    await ui.press({ key: 'procs-down' })
    const procsAt = (await ui.find({ type: 'Text', text: /J2 · PROCESOS/ }))?.text
    expect(procsAt).toContain('17–')
    await ui.press({ key: 'tab-files' })
    expect((await ui.find({ type: 'Text', text: /J3 · ARCHIVOS/ }))?.text).toBe(filesAt)
    await ui.press({ key: 'tab-procs' })
    expect((await ui.find({ type: 'Text', text: /J2 · PROCESOS/ }))?.text).toBe(procsAt)
    // Back to the top for the next surface.
    await ui.press({ key: 'procs-latest' })
    await ui.press({ key: 'tab-files' })
    await ui.press({ key: 'files-up' })
    await ui.unmount()
  }
})

test('size-cycle walks three presets and holds across new calls', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // 60 rows: balanced 40 % graph, then small 25 %, large 60 %, balanced again.
    expect(await boxH(ui)).toEqual([24, 36])
    await ui.press({ key: 'size-cycle' })
    expect(await boxH(ui)).toEqual([15, 45])
    for (let i = 0; i < 2; i++) {
      await $.tool.call({ tool: 'Read', file_path: `/p/r${i}.ts` })
      await ui.redraw()
      expect(await boxH(ui)).toEqual([15, 45])
    }
    await ui.press({ key: 'size-cycle' })
    expect(await boxH(ui)).toEqual([36, 24])
    await ui.press({ key: 'size-cycle' })
    expect(await boxH(ui)).toEqual([24, 36])
    await ui.unmount()
  }
  // Minimum 6 rows per open box.
  expect(heights(14, 0.25, false, false)).toEqual([6, 8])
  expect(heights(14, 0.6, false, false)).toEqual([8, 6])
})

test('fold-tabs and fold-graph leave header rows and give the rest to the other box', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/p/a.ts' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await procKey(ui, /Read/)).toBeTruthy()
    await ui.press({ key: 'fold-tabs' })
    expect(await boxH(ui)).toEqual([57, 3])
    expect(await procKey(ui, /Read/)).toBeFalsy()
    expect(await ui.find({ key: 'tab-procs' })).toBeTruthy()
    expect((await ui.find({ key: 'fold-tabs' }))?.props.label).toBe('▸')
    await ui.press({ key: 'fold-graph' })
    expect(await boxH(ui)).toEqual([3, 3])
    await ui.press({ key: 'fold-tabs' })
    expect(await boxH(ui)).toEqual([3, 57])
    expect(await procKey(ui, /Read/)).toBeTruthy()
    expect(await ui.find({ type: 'Svg' })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /principal \(decide\)/ })).toBeFalsy()
    await ui.press({ key: 'fold-graph' })
    expect(await boxH(ui)).toEqual([24, 36])
    // The graph follows its box: 24 rows minus border and header.
    if (surface === 'desktop') expect((await ui.find({ type: 'Svg' }))?.props.height).toBe(21 * 18)
    else expect(await ui.find({ type: 'Text', text: /principal \(decide\)/ })).toBeTruthy()
    // No drag handles remain.
    expect(await ui.find({ type: 'Client' })).toBeFalsy()
    expect((await ui.findAll({ type: 'Button' })).some(b => b.key?.startsWith('split-'))).toBe(false)
    await ui.unmount()
  }
})

test('wrap_up closes the whole plan; the current task is listed once', async ($, on) => {
  base(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Uno', status: 'completed' }, { content: 'Dos', status: 'in_progress' }] })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-tasks' })
    expect((await ui.findAll({ type: 'Text' })).filter(t => /^▶ Dos/.test(t.text))).toHaveLength(1)
    await ui.unmount()
  }
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'listo' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'tab-tasks' }))?.text).toBe('TAREAS 2/2')
    await ui.press({ key: 'tab-tasks' })
    expect(await ui.find({ type: 'Text', text: /2\/2 · 100%/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^✓ Dos$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /▶/ })).toBeFalsy()
    await ui.unmount()
  }
})

const sub = (i: number, type: string, isDone: boolean, model: string): RadarAgent => ({ id: `s${i}`, type, desc: '', isDone, model })
const FLEET = [
  sub(1, 'experto', true, 'claude-opus-5-5'), sub(2, 'experto', true, 'claude-opus-5-5'), sub(3, 'estandar', true, 'claude-sonnet-5-5'),
  sub(4, 'experto', true, 'claude-opus-5-5'), sub(5, 'rapido', false, 'claude-haiku-5-5'), sub(6, 'rapido', false, 'claude-haiku-5-5'),
]

test('finished subagents of one type and model fold into one ×N entry', async ($, on) => {
  base(on)
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const a of FLEET) {
    await $.classic.SubagentStart({ agent_id: a.id, agent_type: a.type })
    if (a.isDone) await $.classic.SubagentStop({ agent_id: a.id, agent_type: a.type, stop_hook_active: false, agent_transcript_path: '' })
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^ {2}[✓⇄] /.test(t))
  expect(rows.filter(t => /experto ×3/.test(t))).toHaveLength(1)
  expect(rows.filter(t => /⇄ rapido/.test(t))).toHaveLength(2)
  expect(rows.filter(t => /estandar/.test(t) && !/×/.test(t))).toHaveLength(1)
  await ui.unmount()

  const svg = boardSvg(FLEET, [], 'claude-opus-5-5', 0.75)
  expect(svg.match(/✓ EXPERTO ×3/g)).toHaveLength(1)
  expect(svg).not.toMatch(/✓ EXPERTO<|✓ EXPERTO…/)
  expect(svg.match(/>U(9|10)</g)).toHaveLength(2)
})

test('board: cold palette, no sweep band, a pulse from the CPU paced by load', async () => {
  const call = (status: 'run' | 'done' | 'error', i: number) =>
    ({ id: `c${i}`, agent: 'principal', tool: 'Read', kind: 'tool' as const, target: '', status, at: 0 })
  const idle = boardSvg(FLEET, [call('done', 0), call('error', 1)], 'claude-opus-5-5', 0.75)
  const busy = boardSvg(FLEET, [0, 1, 2, 3].map(i => call('run', i)), 'claude-opus-5-5', 1.8)
  for (const svg of [idle, busy]) {
    for (const warm of ['#f97316', '#fb923c', '#fdba74', '#facc15', '#fde68a', '#f59e0b', '#d97757', '#ef4444', '#fca5a5', '#8f7d5a', '#b5b0a5'])
      expect(svg.toLowerCase()).not.toContain(warm)
    expect(svg).not.toContain('sweep')
    expect(svg).toContain('<g id="pulse" clip-path="url(#clipB)">')
    expect(svg).not.toContain('NaN')
  }
  const rings = (svg: string) => (svg.match(/<g id="pulse"[^]*?<\/g>/)?.[0].match(/<circle /g) ?? []).length
  expect(rings(idle)).toBe(1)
  expect(rings(busy)).toBe(3)
  expect(idle).toMatch(/<g id="pulse"[^]*?dur="4s"/)
  expect(busy).toMatch(/<g id="pulse"[^]*?dur="1s"/)
})

// ---------- language ----------
const boot = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], stored?: Record<string, unknown>) => {
  mock.store(on, stored)
  base(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}
// Only the selected tab shows its name: select each in turn and read it.
type Finder0 = { find: (q: { key: string }) => Promise<{ text: string } | null | undefined>; press: (q: { key: string }) => Promise<unknown> }
const labels = async (ui: Finder0) => {
  const out: (string | undefined)[] = []
  for (const k of ['tab-tasks', 'tab-procs', 'tab-files', 'tab-usage']) {
    await ui.press({ key: k })
    out.push((await ui.find({ key: k }))?.text)
  }
  await ui.press({ key: 'tab-procs' })
  return out
}

rawTest('default language is English; lang-toggle switches the whole pane and back', async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'lang-toggle' }))?.props.label).toBe('EN')
  expect(await labels(ui)).toEqual(['TASKS', 'CALLS', 'FILES', 'USAGE'])
  expect((await ui.find({ key: 'graph-toggle' }))?.props.label).toBe('⇄ Radar')
  await ui.press({ key: 'graph-toggle' })
  expect((await ui.find({ key: 'graph-toggle' }))?.props.label).toBe('⇄ Board')
  await ui.press({ key: 'tab-tasks' })
  expect(await ui.find({ type: 'Text', text: /NO ACTIVE PLAN/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /J1 · TASKS/ })).toBeTruthy()
  await ui.press({ key: 'lang-toggle' })
  expect((await ui.find({ key: 'lang-toggle' }))?.props.label).toBe('ES')
  expect(await labels(ui)).toEqual(['TAREAS', 'PROCESOS', 'ARCHIVOS', 'USO'])
  expect((await ui.find({ key: 'graph-toggle' }))?.props.label).toBe('⇄ Placa')
  await ui.press({ key: 'tab-tasks' })
  expect(await ui.find({ type: 'Text', text: /SIN PLAN ACTIVO/ })).toBeTruthy()
  await ui.press({ key: 'lang-toggle' })
  expect(await labels(ui)).toEqual(['TASKS', 'CALLS', 'FILES', 'USAGE'])
  await ui.unmount()
})

rawTest('the language choice is kept in the store and survives a new session.start', async ($, on) => {
  await boot($, on)
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'lang-toggle' })
  await ui.unmount()
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'lang-toggle' }))?.props.label).toBe('ES')
  await ui.unmount()
})

rawTest('a stored language is used from the first draw', async ($, on) => {
  await boot($, on, { lang: 'es' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await labels(ui)).toEqual(['TAREAS', 'PROCESOS', 'ARCHIVOS', 'USO'])
  await ui.unmount()
})

rawTest('boardSvg and graphSvg texts follow the string set; both tables share their keys', async () => {
  const FLEET0: RadarAgent[] = [{ id: 'a', type: 'Explore', desc: '', isDone: false, model: 'claude-haiku-5-5' }, { id: 'b', type: 'Plan', desc: '', isDone: true }]
  const en = boardSvg(FLEET0, [], 'claude-opus-5-5', 0.75, T.en)
  const es = boardSvg(FLEET0, [], 'claude-opus-5-5', 0.75, T.es)
  expect(en).toContain('>FILES<')
  expect(en).toContain('>MAIN<')
  expect(en).toContain('RUNNING')
  expect(en).toContain('○ idle')
  expect(en).not.toMatch(/PRINCIPAL|ARCHIVOS|EN CURSO|en espera/)
  expect(es).toContain('>ARCHIVOS<')
  expect(es).toContain('>PRINCIPAL<')
  expect(es).toContain('EN CURSO')
  expect(es).toContain('○ en espera')
  expect(graphSvg(FLEET0, [], 'claude-opus-5-5', T.en)).toContain('>Files<')
  expect(graphSvg(FLEET0, [], 'claude-opus-5-5', T.es)).toContain('>Archivos<')
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map(x => `${k}.${x}`) : [k])).sort()
  expect(keys(T.es)).toEqual(keys(T.en))
})

// ---------- usage ----------
const ctxOf = (tokens: number, window = 200_000) => ({ tokens, window, percent: Math.round((tokens / window) * 100) })
const TU = (model: string, i: number, o: number, r: number, c: number) => ({ model, input_tokens: i, output_tokens: o, cache_read_input_tokens: r, cache_creation_input_tokens: c })
const agentInfo = (id: string, type: string, model: string, usage: ReturnType<typeof TU>[], taskStatus = 'completed', usd?: number) =>
  ({ id, description: '', type, status: taskStatus, kind: 'local_agent', taskStatus, label: '', startTime: 0, cwd: '/', model, tokenCount: 0, tokenSamples: [], hasRow: false, usage, ...(usd !== undefined ? { cost: { usd } } : {}) })

/** Boots a session over mutable usage/agent mocks; `step()` fires a turn.step through the engine. */
async function usageBoot($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], stored: Record<string, unknown> = {}) {
  const w = { usage: { startedAt: 0, context: { window: 200_000 } as Record<string, unknown>, rateLimits: [] as unknown[], cost: undefined as unknown }, agents: [] as unknown[], toasts: [] as string[], stepUsage: TU('claude-opus-5-5', 100, 50, 1000, 200) as unknown }
  mock.store(on, { lang: 'es', ...stored })
  base(on)
  on('session.usage', () => ({ value: w.usage }) as never)
  on('agent.list', () => ({ value: w.agents }) as never)
  on('ui.toast', (_, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: w.stepUsage } as never
  })
  const step = async (agentId?: string) => {
    const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) })
    for await (const _ of s) void _
    return s.result
  }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  return { w, step }
}

rawTest('fmt: compact token counts', async () => {
  expect([999, 1000, 12_300, 1_200_000, 999_960].map(fmt)).toEqual(['999', '1.0k', '12.3k', '1.2M', '1.0M'])
})

rawTest('meter strip shows context and rate limits only when reported', async ($, on) => {
  const { w, step } = await usageBoot($, on)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /CTX/ })).toBeFalsy()
  await ui.unmount()
  w.usage.context = ctxOf(86_000)
  await step()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /CTX 43%/ }))?.text).toContain('CTX 43%')
  expect((await ui.find({ type: 'Text', text: /86\.0k\/200\.0k/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /5H|7D/ })).toBeFalsy()
  expect((await ui.find({ key: 'tab-usage' }))?.text).toBe('◔ 43%')
  await ui.unmount()
  w.usage.rateLimits = [{ kind: 'five_hour', percentUsed: 20 }, { kind: 'seven_day', percentUsed: 61.4 }]
  await step()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /5H 20%/ }))?.text).toContain('7D 61%')
  await ui.unmount()
})

rawTest('handoff: off by default, cycles, persists, toasts once per crossing', async ($, on) => {
  const { w, step } = await usageBoot($, on)
  w.usage.context = ctxOf(120_000)
  await step()
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /RELEVO/ })).toBeFalsy()
  await ui.press({ key: 'tab-usage' })
  expect((await ui.find({ key: 'handoff-cycle' }))?.props.label).toBe('⚑ OFF')
  await ui.press({ key: 'handoff-cycle' })
  expect((await ui.find({ key: 'handoff-cycle' }))?.props.label).toBe('⚑ 100k')
  expect(await ui.find({ type: 'Text', text: /⚑ RELEVO/ })).toBeTruthy()
  expect(w.toasts).toHaveLength(1)
  await step()
  await step()
  expect(w.toasts).toHaveLength(1)
  // Usage drops (compaction): re-armed, then a new crossing toasts again.
  w.usage.context = ctxOf(20_000)
  await step()
  expect(await ui.find({ type: 'Text', text: /⚑ RELEVO/ })).toBeFalsy()
  w.usage.context = ctxOf(130_000)
  await step()
  expect(w.toasts).toHaveLength(2)
  await ui.unmount()
  // A new session.start loads the stored choice.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-usage' })
  expect((await ui.find({ key: 'handoff-cycle' }))?.props.label).toBe('⚑ 100k')
  await ui.unmount()
})

rawTest('a stored handoff and cost choice load at session.start', async ($, on) => {
  const { w } = await usageBoot($, on, { handoff: 150_000, cost: true })
  w.usage.cost = { usd: 1.5 }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-usage' })
  expect((await ui.find({ key: 'handoff-cycle' }))?.props.label).toBe('⚑ 150k')
  expect((await ui.find({ key: 'cost-toggle' }))?.props.label).toBe('$ coste: ON')
  await ui.unmount()
})

rawTest('USO tab: rows for main and subagents, totals by model, cost off until toggled', async ($, on) => {
  const { w, step } = await usageBoot($, on)
  w.usage.context = ctxOf(86_000)
  w.usage.cost = { usd: 2 }
  w.agents = [
    agentInfo('a1', 'rapido', 'claude-haiku-5-5', [TU('claude-haiku-5-5', 1000, 500, 8000, 500)], 'completed', 0.5),
    agentInfo('a2', 'rapido', 'claude-haiku-5-5', [TU('claude-haiku-5-5', 1000, 500, 8000, 500)], 'completed', 0.5),
    agentInfo('a3', 'experto', 'claude-opus-5-5', [TU('claude-opus-5-5', 2000, 1000, 0, 0)], 'running', 0.25),
  ]
  await step() // main: 100 in, 50 out, 1000 read, 200 written = 1350
  await step() // 2700
  // A subagent step must not reach the main row: its figures come from agent.list().
  await step('a3')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-usage' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.find(x => /principal.*Opus 5\.5.*2\.7k/.test(x))).toBeTruthy()
  expect(texts.filter(x => /rapido ×2.*Haiku 5\.5.*20\.0k/.test(x))).toHaveLength(1)
  expect(texts.find(x => /experto.*Opus 5\.5.*3\.0k/.test(x))).toBeTruthy()
  expect(texts).toContain('  ent 200 · sal 100 · caché 2.4k')
  // By model: Opus = main 2.7k + experto 3.0k; Haiku = 2 x 10.0k.
  expect(texts.find(x => /^Opus 5\.5\s+5\.7k/.test(x))).toBeTruthy()
  expect(texts.find(x => /^Haiku 5\.5\s+20\.0k/.test(x))).toBeTruthy()
  expect(texts.some(x => /≈\$/.test(x))).toBe(false)
  await ui.press({ key: 'cost-toggle' })
  expect((await ui.findAll({ type: 'Text' })).some(t => /≈\$2\.00/.test(t.text))).toBe(true)
  await ui.unmount()
  // Persisted: a new session.start loads it back.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await again.press({ key: 'tab-usage' })
  expect((await again.find({ key: 'cost-toggle' }))?.props.label).toBe('$ coste: ON')
  await again.unmount()
})

rawTest('USAGE tab renders in English and shows the empty states', async ($, on) => {
  const { w, step } = await usageBoot($, on, { lang: 'en' })
  w.usage.context = ctxOf(86_000)
  await step()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-usage' })
  expect((await ui.find({ key: 'tab-usage' }))?.text).toBe('USAGE 43%')
  expect(await ui.find({ type: 'Text', text: /RATE LIMITS/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /The host reports no rate limits/ })).toBeTruthy()
  expect((await ui.find({ key: 'cost-toggle' }))?.props.label).toBe('$ cost: OFF')
  await ui.unmount()
})
