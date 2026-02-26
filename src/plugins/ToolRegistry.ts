import type { ToolPlugin } from './ToolPlugin'

/**
 * Singleton registry for tool plugins.
 * Enables future tools to be added via the plugin pattern.
 */
class ToolRegistryImpl {
  private plugins: Map<string, ToolPlugin> = new Map()

  register(plugin: ToolPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Tool plugin "${plugin.id}" is already registered. Overwriting.`)
    }
    this.plugins.set(plugin.id, plugin)
  }

  unregister(id: string): boolean {
    const plugin = this.plugins.get(id)
    if (plugin) {
      plugin.dispose?.()
      this.plugins.delete(id)
      return true
    }
    return false
  }

  get(id: string): ToolPlugin | undefined {
    return this.plugins.get(id)
  }

  getAll(): ToolPlugin[] {
    return Array.from(this.plugins.values())
  }

  getByCategory(category: ToolPlugin['category']): ToolPlugin[] {
    return this.getAll().filter((p) => p.category === category)
  }

  has(id: string): boolean {
    return this.plugins.has(id)
  }

  clear(): void {
    this.plugins.forEach((p) => p.dispose?.())
    this.plugins.clear()
  }
}

export const ToolRegistry = new ToolRegistryImpl()
