// 'claude-opus-5-5[1m]' -> 'Opus 5.5'; anything else is shown as given.
export function pretty(model?: string): string {
  if (!model) return '?'
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(model)
  if (!m) return model.replace(/^claude-/, '')
  const fam = m[1]!.toLowerCase()
  return `${fam[0]!.toUpperCase()}${fam.slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`
}
