/**
 * Single point of Fabric.js v5 interop.
 *
 * Fabric 5 ships as CommonJS whose `module.exports` carries the `fabric`
 * namespace, but some bundler/interop paths hand back the namespace itself.
 * Resolve that once here and re-export it with the real `@types/fabric` types
 * so the rest of the app never has to cast.
 */
import fabricModule from 'fabric'
import type { fabric as fabricNamespace } from 'fabric'

export type FabricNamespace = typeof fabricNamespace

const resolved: FabricNamespace =
  (fabricModule as { fabric?: FabricNamespace }).fabric ??
  (fabricModule as unknown as FabricNamespace)

export const fabric = resolved
