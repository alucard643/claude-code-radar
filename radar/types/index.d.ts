export type RadarAgent = {
  id: string
  type: string
  desc: string
  isDone: boolean
  tool?: string
  model?: string
}

export type RadarTask = { content: string; status: string }

export type RadarCall = {
  id: string
  agent: string
  tool: string
  kind: 'skill' | 'mcp' | 'plugin' | 'webhook' | 'web' | 'agent' | 'tool'
  target: string
  status: 'run' | 'done' | 'error'
  at: number
  ms?: number
  model?: string
  /** First 600 chars of the error the model read; failed calls only. */
  err?: string
}

export type RadarFile = { path: string; op: 'read' | 'edit' | 'create' }

/** Unified-diff lines ('@@ …', '+x', '-x', ' x') per edited file path. */
export type RadarDiffs = Record<string, string[]>

/** Tokens of one model: uncached in, out, cache read, cache written. */
export type RadarRow = { m: string; i: number; o: number; r: number; c: number }

/** Last known figures of one subagent; kept after it leaves $.agent.list(). */
export type RadarSpend = { id: string; type: string; done: boolean; rows: RadarRow[]; usd?: number }

/** Last reading of $.session.usage(); a missing figure is left out, never zeroed. */
export type RadarUsage = {
  ctx?: { tokens: number; window: number; percent: number }
  limits: { kind: string; pct: number; resets?: string }[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    radar: {
      agents: Shaped<RadarAgent[]>
      tasks: Shaped<RadarTask[]>
      calls: Shaped<RadarCall[]>
      files: Shaped<RadarFile[]>
      scroll: Shaped<{ procs: number; files: number; det: number; mark: string; tasks: number; tasksFor: string; usage: number }>
      models: Shaped<Record<string, string>>
      diffs: Shaped<RadarDiffs>
      open: Shaped<{ path: string }>
      view: Shaped<{ graph: 'board' | 'radar' }>
      fold: Shaped<{ graph: boolean; tabs: boolean }>
      pick: Shaped<{ ids: string[] }>
      filter: Shaped<{ errors: boolean; agent: string }>
      since: Shaped<{ content: string; at: number }>
      tab: Shaped<{ tab: 'tasks' | 'procs' | 'files' | 'usage' }>
      size: Shaped<{ i: number }>
      lang: Shaped<{ l: 'en' | 'es' }>
      usage: Shaped<RadarUsage>
      ledger: Shaped<{ main: RadarRow[]; subs: RadarSpend[] }>
      prefs: Shaped<{ handoff: number; cost: boolean }>
      alert: Shaped<{ fired: boolean }>
    }
  }
}
