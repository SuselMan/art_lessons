/** (#613) The fields every operation carries. Private to the operation
 *  modules: index.ts does not re-export it, and never did. */

export type OperationBase = {
  id: string
  userId: string
  timestamp: number
  seq?: number          // total order; assigned by the server (local log until then)
}
