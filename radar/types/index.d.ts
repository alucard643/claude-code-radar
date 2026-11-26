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

declare module 'claude-code' {
  interface PluginState {
    radar: {
      agents: Shaped<RadarAgent[]>
      tasks: Shaped<RadarTask[]>
      calls: Shaped<RadarCall[]>
      files: Shaped<RadarFile[]>
      scroll: Shaped<{ procs: number; files: number; det: number; mark: string; tasks: number; tasksFor: string }>
      models: Shaped<Record<string, string>>
      diffs: Shaped<RadarDiffs>
      open: Shaped<{ path: string }>
      view: Shaped<{ graph: 'board' | 'radar' }>
      fold: Shaped<{ graph: boolean; tabs: boolean }>
      pick: Shaped<{ ids: string[] }>
      filter: Shaped<{ errors: boolean; agent: string }>
      since: Shaped<{ content: string; at: number }>
      tab: Shaped<{ tab: 'tasks' | 'procs' | 'files' }>
      size: Shaped<{ i: number }>
    }
  }
}
