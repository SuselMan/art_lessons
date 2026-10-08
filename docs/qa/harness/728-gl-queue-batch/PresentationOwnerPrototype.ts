/** QA-only control prototype. No engine/Room wiring, GPU work or implicit queue completion. */
export interface OwnedPresentationLease {
  readonly bytes: number
  readonly resources: readonly { readonly identity: object; readonly role: 'presentation' | 'canonical-source'; readonly width: number; readonly height: number }[]
  /** Must release the independent presentation AND captured physical source leases. */
  release(): void
}
export interface OwnerToken { readonly sequence: number; readonly layerId: string; readonly gesture: number }
interface Entry<F> {
  token: OwnerToken
  lease: OwnedPresentationLease
  visible: boolean
  status: 'drawing' | 'ready' | 'canonical'
  finish?: Readonly<F>
}
export type Admission = { readonly accepted: true; readonly token: OwnerToken } |
  { readonly accepted: false; readonly reason: 'capacity' | 'memory' }

export class PresentationOwnerPrototype<F> {
  private readonly entries = new Map<OwnerToken, Entry<F>>()
  private readonly detachFinish: (finish: F) => Readonly<F>
  private readonly maxOwners: number
  private readonly budgetBytes: number
  private sequence = 0
  private bytes = 0
  private readonly resources = new Set<object>()
  private active: OwnerToken | null = null

  constructor(options: { maxOwners: number; budgetBytes: number; detachFinish: (finish: F) => Readonly<F> }) {
    if (!Number.isInteger(options.maxOwners) || options.maxOwners < 1 || options.maxOwners > 3) throw Error('Bounded owner count required')
    if (!Number.isSafeInteger(options.budgetBytes) || options.budgetBytes < 0) throw Error('Explicit byte budget required')
    this.maxOwners = options.maxOwners
    this.budgetBytes = options.budgetBytes
    this.detachFinish = options.detachFinish
  }

  /** Rejection retains caller lease ownership. It never drains, paints or drops input. */
  admit(layerId: string, gesture: number, lease: OwnedPresentationLease): Admission {
    if (!layerId || !Number.isSafeInteger(gesture) || gesture < 0 || !Number.isSafeInteger(lease.bytes) || lease.bytes < 0) throw Error('Invalid owner passport')
    const identities = new Set<object>(); let actualBytes = 0
    for (const resource of lease.resources) {
      if (!Number.isSafeInteger(resource.width) || resource.width < 1 || !Number.isSafeInteger(resource.height) || resource.height < 1) throw Error('Invalid RGBA8 resource')
      if (identities.has(resource.identity) || this.resources.has(resource.identity)) throw Error('Physical owner resource alias')
      identities.add(resource.identity); actualBytes += resource.width * resource.height * 4
    }
    if (actualBytes !== lease.bytes || !lease.resources.some(r => r.role === 'presentation') || !lease.resources.some(r => r.role === 'canonical-source')) throw Error('Independent presentation/source resource ledger required')
    if (this.entries.size >= this.maxOwners) return { accepted: false, reason: 'capacity' }
    if (lease.bytes > this.budgetBytes - this.bytes) return { accepted: false, reason: 'memory' }
    const token = Object.freeze({ sequence: ++this.sequence, layerId, gesture })
    const ownedLease = Object.freeze({ bytes: lease.bytes, resources: Object.freeze(lease.resources.map(r => Object.freeze({ ...r }))), release: lease.release.bind(lease) })
    this.entries.set(token, { token, lease: ownedLease, status: 'drawing', visible: false })
    this.bytes += lease.bytes
    for (const identity of identities) this.resources.add(identity)
    return { accepted: true, token }
  }

  publishSource(token: OwnerToken): void { this.require(token).visible = true }

  /** The adapter must detach CPU metadata AND retain immutable physical source before calling. */
  seal(token: OwnerToken, finish: F): void {
    const entry = this.require(token)
    if (entry.status !== 'drawing') throw Error('Owner sealed twice')
    const detached = this.detachFinish(finish)
    entry.finish = detached
    entry.status = 'ready'
    // Visibility deliberately unchanged: UP is not a canonical landing.
  }

  takeCanonical(): { token: OwnerToken; finish: Readonly<F> } | null {
    if (this.active) return null
    const first = this.entries.values().next().value as Entry<F> | undefined
    if (!first || first.status !== 'ready') return null
    first.status = 'canonical'
    this.active = first.token
    return { token: first.token, finish: first.finish! }
  }

  /** Caller must atomically publish this owner's canonical material before retiring its overlay. */
  land(token: OwnerToken): void {
    if (this.active !== token || this.require(token).status !== 'canonical') throw Error('Stale/out-of-order canonical landing')
    this.active = null
    this.retire(token)
  }

  cancel(token: OwnerToken): boolean {
    if (!this.entries.has(token)) return false
    if (this.active === token) this.active = null
    this.retire(token)
    return true
  }
  cancelLayer(layerId: string): void {
    this.cancelTokens([...this.entries.keys()].filter(token => token.layerId === layerId))
  }
  dispose(): void { this.cancelTokens([...this.entries.keys()]) }
  private cancelTokens(tokens: readonly OwnerToken[]): void {
    const errors: unknown[] = []
    for (const token of tokens) try { this.cancel(token) } catch (error) { errors.push(error) }
    if (errors.length) throw new AggregateError(errors, 'Owner release failures')
  }
  visible(): readonly OwnerToken[] { return [...this.entries.values()].filter(e => e.visible).map(e => e.token) }
  snapshot() { return { bytes: this.bytes, active: this.active, owners: [...this.entries.values()].map(e => ({ token: e.token, visible: e.visible, status: e.status })) } }

  private require(token: OwnerToken): Entry<F> {
    const entry = this.entries.get(token)
    if (!entry) throw Error('Unknown/retired presentation owner')
    return entry
  }
  private retire(token: OwnerToken): void {
    const entry = this.require(token)
    // Detach first: even a throwing release cannot retire a later owner's overlay.
    this.entries.delete(token)
    this.bytes -= entry.lease.bytes
    for (const resource of entry.lease.resources) this.resources.delete(resource.identity)
    entry.lease.release()
  }
}
