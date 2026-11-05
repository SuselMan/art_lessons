// Share the decoded-body allowance across simultaneous preparation callers.
// Large assets keep the existing single-response allowance; small animation
// frames can overlap network latency without an unbounded Promise.all burst.
const MAX_READS = 4
const MAX_BYTES = 2048 * 2048
const queue: { bytes: number; start: () => void }[] = []
let active = 0
let bytes = 0

function drain(): void {
  while (queue.length && active < MAX_READS && bytes + queue[0].bytes <= MAX_BYTES) {
    const next = queue.shift()!
    active++
    bytes += next.bytes
    next.start()
  }
}

export function readBrushAsset<T>(expectedBytes: number, read: () => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 4 || expectedBytes > MAX_BYTES) throw new RangeError('Invalid brush asset body size')
  return new Promise<T>((resolve, reject) => {
    queue.push({ bytes: expectedBytes, start: () => {
      void Promise.resolve().then(read).then(resolve, reject).finally(() => {
        active--
        bytes -= expectedBytes
        drain()
      })
    } })
    drain()
  })
}
