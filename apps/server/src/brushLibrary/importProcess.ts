import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as pause } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'

/** One actual importer process and its Linux descendants. Cancellation finishes
 * only after child close, so queue release and work-directory removal cannot
 * race a still-running decoder. The caller never supplies a process/group ID. */
export interface BrushImportProcess {
  readonly finished: Promise<void>
  cancel(): void
}

/** The cache must change whenever converter code changes, including its helpers. */
export async function brushImporterFingerprint(script: string, python: string): Promise<string> {
  const hash=createHash('sha256').update('grafetto-brush-import-v2\0').update(python).update('\0')
  const directory=dirname(script),entry=basename(script)
  const files=entry.endsWith('.py')
    ? (await readdir(directory,{withFileTypes:true})).filter(d=>d.isFile()&&!d.name.startsWith('test_')&&/\.(py|mjs|json)$/.test(d.name)).map(d=>d.name).sort()
    : [entry]
  if(!files.includes(entry))throw Error('Brush converter is unavailable')
  for(const file of files){hash.update(file).update('\0');hash.update(await readFile(join(directory,file)));hash.update('\0')}
  return hash.digest('hex')
}

/** Large authored bundles can require many bounded native-mask conversions.
 * Keep small uploads on the historical limit and cap all workers at 20 min. */
export function brushImportLimits(bytes: number): { cpuSeconds: number; timeoutMs: number } {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 512 * 1024 * 1024) throw new RangeError('Invalid brush import size')
  const cpuSeconds = Math.min(1100, Math.max(110, Math.ceil(bytes / (1024 * 1024)) * 6))
  return { cpuSeconds, timeoutMs: Math.min(20 * 60_000, cpuSeconds * 1000 + (cpuSeconds === 110 ? 10_000 : 90_000)) }
}

export function startBrushImportProcess(command: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs = 120_000): BrushImportProcess {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20 * 60_000) throw new RangeError('Invalid brush import deadline')
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
