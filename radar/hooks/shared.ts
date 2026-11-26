import type { RadarAgent, RadarCall } from '../types'

export type Kind = RadarCall['kind']

export const short = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Cold palette only: warm hues read as an overheating chip. Seven hues spread 150-275 deg plus steel and ice.
export const KIND_COLOR: Record<Kind, string> = {
  skill: '#c28dff', // violet
  mcp: '#4192ff', // azure
  plugin: '#9aa0ff', // periwinkle / indigo
  webhook: '#7debc2', // seafoam / mint
  web: '#26bfae', // teal
  agent: '#dcf2ff', // ice white
  tool: '#8fa5bc', // steel
}
// The one non-cold hue: errors and deleted lines only.
export const ERR = '#f0507a', ERR_SOFT = '#ffa3bd'

// Finished subagents fold by type+model into one entry with a count; running ones stay one each.
export type AgentGroup = { ag: RadarAgent; n: number }
export function groupAgents(list: RadarAgent[], max = 8): AgentGroup[] {
  const run = list.filter(a => !a.isDone).map(ag => ({ ag, n: 1 }))
  const done = new Map<string, AgentGroup>()
  for (const ag of list) {
    if (!ag.isDone) continue
    const k = `${ag.type}|${ag.model ?? ''}`
    const g = done.get(k)
    if (g) { g.n++; g.ag = ag } else done.set(k, { ag, n: 1 })
  }
  return [...run, ...done.values()].slice(0, max)
}

// One station (radar) or peripheral chip (board) per kind of tool; labels live in i18n.ts.
export const STATIONS: { kind: Kind }[] = [
  { kind: 'tool' },
  { kind: 'skill' },
  { kind: 'mcp' },
  { kind: 'plugin' },
  { kind: 'webhook' },
  { kind: 'web' },
  { kind: 'agent' },
]
