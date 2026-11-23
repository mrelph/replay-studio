export interface ToolDefaults {
  duration: number
  fadeIn: number
  fadeOut: number
  drawIn: number
}

export const TOOL_DEFAULTS: Record<string, ToolDefaults> = {
  pen: { duration: 1.5, fadeIn: 0.1, fadeOut: 0.15, drawIn: 0.4 },
  path: { duration: 1.5, fadeIn: 0.1, fadeOut: 0.15, drawIn: 0.4 },
  arrow: { duration: 2, fadeIn: 0.1, fadeOut: 0.1, drawIn: 0.35 },
  'arc-arrow': { duration: 2, fadeIn: 0.1, fadeOut: 0.1, drawIn: 0.35 },
  rectangle: { duration: 2.5, fadeIn: 0, fadeOut: 0, drawIn: 0.4 },
  circle: { duration: 2.5, fadeIn: 0, fadeOut: 0, drawIn: 0.4 },
  spotlight: { duration: 1.5, fadeIn: 0.15, fadeOut: 0.25, drawIn: 0 },
  magnifier: { duration: 2, fadeIn: 0.1, fadeOut: 0.1, drawIn: 0 },
  tracker: { duration: 15, fadeIn: 0, fadeOut: 0, drawIn: 0 },
  text: { duration: 2.5, fadeIn: 0.05, fadeOut: 0.1, drawIn: 0 },
  line: { duration: 2, fadeIn: 0, fadeOut: 0, drawIn: 0.35 },
  select: { duration: 2.5, fadeIn: 0, fadeOut: 0, drawIn: 0 },
}

export function getToolDefaults(toolType: string): ToolDefaults {
  return TOOL_DEFAULTS[toolType] || { duration: 5, fadeIn: 0, fadeOut: 0, drawIn: 0 }
}
