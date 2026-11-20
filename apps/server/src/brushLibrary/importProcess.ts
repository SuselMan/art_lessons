import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as pause } from 'node:timers/promises'

/** One actual importer process and its Linux descendants. Cancellation finishes
 * only after child close, so queue release and work-directory removal cannot
 * race a still-running decoder. The caller never supplies a process/group ID. */
export interface BrushImportProcess {
  readonly finished: Promise<void>
  cancel(): void
}

export function startBrushImportProcess(command: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs = 120_000): BrushImportProcess {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) throw new RangeError('Invalid brush import deadline')
  const grouped = process.platform === 'linux'
  const child = spawn(command, [...args], { detached: grouped, stdio: ['ignore', 'ignore', 'ignore'], env })
  let closed = false
  let failure: Error | undefined
  const terminate = () => {
    if (closed) return
    const pid = child.pid
    if (grouped && pid !== undefined && Number.isSafeInteger(pid) && pid > 1) {
      try { process.kill(-pid, 'SIGKILL') }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          failure ??= error instanceof Error ? error : Error('Unable to terminate brush import')
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        }
      }
    } else if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  const finished = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { failure ??= Error('Brush import timed out'); terminate() }, timeoutMs)
    child.once('error', error => { failure ??= error })
    child.once('close', code => {
      clearTimeout(timer)
      // Also stop any unexpected orphan decoder after a normal Python exit.
      // This is the same just-created session, never an externally supplied PID.
      terminate()
      closed = true
      const descendants = grouped && child.pid !== undefined ? awaitOwnedDecoders(child.pid) : Promise.resolve()
      void descendants.then(() => {
        if (failure) reject(failure)
        else if (code === 0) resolve()
        else reject(Error('Unsupported or damaged brush file'))
      }, reject)
    })
  })
  return { finished, cancel() { if (!closed) { failure ??= Error('Brush import interrupted'); terminate() } } }
}

/** SIGKILL is asynchronous: the parent can close before its decoder is scheduled.
 * Ignore zombies, which can no longer access the work directory. Only inspect
 * the process group AND session minted by our detached spawn, never a caller PID. */
async function awaitOwnedDecoders(group: number): Promise<void> {
  for (;;) {
    const entries = await readdir('/proc')
    const states = await Promise.all(entries.filter(name => /^\d+$/.test(name)).map(async name => {
      try {
        const stat = await readFile(`/proc/${name}/stat`, 'utf8')
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
        return fields[2] === String(group) && fields[3] === String(group) && fields[0] !== 'Z' && fields[0] !== 'X'
      } catch (error) {
        if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
        throw error
      }
    }))
    if (!states.some(Boolean)) return
    await pause(10)
  }
}
