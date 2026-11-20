/** Picker membership only. Rendering and historical resources remain in the
 * engine registry independently of which brushes the room currently offers. */
let selection: readonly string[] | undefined
export const currentBrushSelection = (): readonly string[] | undefined => selection
export function setCurrentBrushSelection(next: readonly string[] | undefined): void { selection = next }
