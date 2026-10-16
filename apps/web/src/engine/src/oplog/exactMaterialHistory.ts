import type {Operation} from '@grafetto/shared'

/** Undo caches carry an entire material state, so an unchanged prefix alone is
 * insufficient: a later Dry or a same-ID water projection must reject it. */
export function exactMaterialHistory(operations: readonly Operation[], read: () => readonly Operation[]): () => boolean {
  const material=(ops:readonly Operation[])=>ops.filter(op=>op.type!=='operation_undo' && op.type!=='operation_redo' && op.type!=='operation_revoke')
  const saved=material(operations)
  return ()=>{const current=material(read());return saved.length===current.length && saved.every((op,i)=>op===current[i])}
}
