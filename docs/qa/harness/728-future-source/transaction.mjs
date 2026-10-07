/** CPU prototype only. No engine import, global option, GL allocation or runtime wiring. */
export class FutureSourceTransaction {
  constructor({ enabled = false, oldJob, futureScratch, epoch, resources, release, maxCommands = 4096 }) {
    this.state = 'disabled'; this.commands = []; this.resources = resources; this.release = release
    if (!enabled) return
    if (!oldJob || !futureScratch || oldJob.scratch === futureScratch || !Number.isInteger(epoch)) throw new Error('Distinct owned predecessor/future required')
    if (!Array.isArray(resources) || !resources.length || typeof release !== 'function' || !Number.isInteger(maxCommands) || maxCommands < 1) throw new Error('Bounded owned resources required')
    this.maxCommands = maxCommands
    if (!resources.every(r => r && r.alive() && r.retained === true)) throw new Error('Unowned sampler')
    this.oldJob = oldJob; this.futureScratch = futureScratch; this.epoch = epoch; this.state = 'capturing'
  }
  append(command) {
    if (this.state !== 'capturing') throw new Error('Capture closed')
    if (!command?.immutable || typeof command.run !== 'function') throw new Error('Immutable command required')
    if (this.commands.length >= this.maxCommands) throw new Error('Future source command budget exceeded')
    this.commands.push(command)
  }
  /** Called AFTER old physical finish AND engine layer composite. Identity is mandatory. */
  complete({ oldJob, epoch, compositeDone, rebaseOriginal, restoreImportedBase, compositeFuture }) {
    if (oldJob !== this.oldJob || epoch !== this.epoch || this.state !== 'capturing') return false
    if (!compositeDone || !this.resources.every(r => r.alive())) throw new Error('Old composite/resources not ready')
    this.state = 'rebasing'
    try {
      rebaseOriginal(this.futureScratch)
      // Callback restores separately retained import/base state, never temporary donor pointers.
      restoreImportedBase(this.futureScratch)
      for (const command of this.commands) command.run(this.futureScratch)
      compositeFuture(this.futureScratch)
      this.state = 'ready'; this.commands = []; this.release(false); return true
    } catch (error) { this.state = 'failed'; throw error }
  }
  cancel({ lost = false } = {}) {
    if (['disabled', 'cancelled', 'ready'].includes(this.state)) return false
    this.commands = []; this.state = 'cancelled'; this.release(lost); return true
  }
  get blocksPublication() { return ['capturing', 'rebasing', 'failed'].includes(this.state) }
}
