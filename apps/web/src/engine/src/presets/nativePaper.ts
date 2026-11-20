import type { PaperType, ToolType } from '@grafetto/shared'

const PREFIX = 'paper-fine:'
/** The existing preset token records the deposit profile, independently of sheet appearance. */
export function nativePaperPreset(tool: ToolType, paper: PaperType | undefined, preset: string): string {
  return paper === 'flat' && ['pencil', 'colorPencil', 'charcoal'].includes(tool)
    ? PREFIX + baseNativePreset(preset) : preset
}
export function baseNativePreset(preset: string): string {
  return preset.startsWith(PREFIX) ? preset.slice(PREFIX.length) : preset
}
export function hasNativeFinePaper(preset: string): boolean { return preset.startsWith(PREFIX) }
