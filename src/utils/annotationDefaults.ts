export interface ToolDefaults {
  duration: number
  fadeIn: number
  fadeOut: number
}

export const TOOL_DEFAULTS: Record<string, ToolDefaults> = {
  pen: { duration: 1.5, fadeIn: 0.1, fadeOut: 0.15 },
  path: { duration: 1.5, fadeIn: 0.1, fadeOut: 0.15 },
  arrow: { duration: 2, fadeIn: 0.1, fadeOut: 0.1 },
  rectangle: { duration: 2.5, fadeIn: 0, fadeOut: 0 },
  circle: { duration: 2.5, fadeIn: 0, fadeOut: 0 },
  spotlight: { duration: 1.5, fadeIn: 0.15, fadeOut: 0.25 },
  magnifier: { duration: 2, fadeIn: 0.1, fadeOut: 0.1 },
  tracker: { duration: 15, fadeIn: 0, fadeOut: 0 },
  text: { duration: 2.5, fadeIn: 0.05, fadeOut: 0.1 },
  line: { duration: 2, fadeIn: 0, fadeOut: 0 },
  select: { duration: 2.5, fadeIn: 0, fadeOut: 0 },
}

export function getToolDefaults(toolType: string): ToolDefaults {
  return TOOL_DEFAULTS[toolType] || { duration: 5, fadeIn: 0, fadeOut: 0 }
}
