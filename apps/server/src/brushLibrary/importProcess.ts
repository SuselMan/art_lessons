import { spawn } from 'node:child_process'

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
      if (failure) reject(failure)
      else if (code === 0) resolve()
      else reject(Error('Unsupported or damaged brush file'))
    })
  })
  return { finished, cancel() { if (!closed) { failure ??= Error('Brush import interrupted'); terminate() } } }
}
