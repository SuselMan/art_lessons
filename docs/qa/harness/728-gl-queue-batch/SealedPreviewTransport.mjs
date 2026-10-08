/** QA-only physical lease contract. No renderer, timing or physics claims. */
export const PREVIEW_BYTES = 6 * 128 * 128 * 4 + 1024 * 1024 * 4
const SOURCE_ROLES = ['original', 'coverage', 'pigmentLoad', 'pigmentBase', 'colourLoad', 'colourBase', 'solventLoad', 'solventBase']
export class SealedPreviewTransport {
  constructor({ source, lease, token }) {
    const inputs = SOURCE_ROLES.map(role => source[role])
    if (inputs.some(x => !x)) throw new Error('Missing readonly source role')
    const small = ['p0', 'c0', 'p1', 'c1', 'water', 'coverage'].map(k => lease[k])
    const owned = [...small, lease.pending]
    if (owned.some(x => !x?.texture) || new Set(owned.map(x => x.texture)).size !== 7) throw new Error('Physical preview aliases')
    if (small.some(x => x.width !== 128 || x.height !== 128) || lease.pending.width !== 1024 || lease.pending.height !== 1024) throw new Error('Preview dimensions')
    if (owned.some(x => inputs.some(i => (i.texture ?? i) === x.texture))) throw new Error('Preview aliases readonly source')
    if (lease.bytes !== PREVIEW_BYTES || typeof lease.release !== 'function') throw new Error('Explicit physical ledger required')
    this.source = Object.freeze(Object.fromEntries(SOURCE_ROLES.map(k => [k, source[k]])))
    this.lease = lease; this.token = token; this.epoch = 0; this.state = 'ACTIVE'; this.front = 0; this.inFlight = null
  }
  seal() { if (this.state !== 'ACTIVE') throw new Error('Seal state'); this.state = 'SEALED'; return this.reset() }
  reset() {
    if (this.state !== 'SEALED' || this.inFlight) throw new Error('Reset requires idle sealed epoch')
    this.epoch++; this.front = 0
    return Object.freeze({ token: this.token, epoch: this.epoch, source: this.source, out: Object.freeze({ p: this.lease.p0, c: this.lease.c0, water: this.lease.water, coverage: this.lease.coverage }) })
  }
  begin({ penActive = false } = {}) {
    if (this.state !== 'SEALED' || this.inFlight || penActive) return null
    const old = this.front, next = 1 - old
    const ticket = Object.freeze({ token: this.token, epoch: this.epoch, p: this.lease[`p${old}`], c: this.lease[`c${old}`], outP: this.lease[`p${next}`], outC: this.lease[`c${next}`], water: this.lease.water, coverage: this.lease.coverage, pending: this.lease.pending })
    this.inFlight = ticket; return ticket
  }
  complete(ticket) {
    if (this.inFlight !== ticket) return false
    this.inFlight = null
    if (this.state !== 'SEALED' || ticket.epoch !== this.epoch || ticket.token !== this.token) return false
    this.front = 1 - this.front; return true
  }
  retire() { if (this.retirement) return this.retirement; this.state = 'RETIRING'; this.epoch++; this.retirement = Object.freeze({ token: this.token, epoch: this.epoch }); return this.retirement }
  releaseAfterFence(fence) {
    if (this.state === 'RELEASED' && fence === this.retirement) return
    if (this.state !== 'RETIRING' || fence?.token !== this.token || fence.epoch !== this.epoch) throw new Error('Physical release requires matching GPU-idle fence')
    this.inFlight = null; this.state = 'RELEASED'; this.lease.release()
  }
}
