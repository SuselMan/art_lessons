import type { Dab } from './index.js'

// (#366) Compact encoding for a stroke operation's dab array.
//
// A dab is ten numbers. Serialized as JSON it measures ~250 bytes — a figure
// taken from real room data, not estimated (see engine/index.ts's
// STROKE_DAB_CHUNK_LIMIT). Packed as ten float32s it is 40, and base64 brings
// that back to ~53: a little under 5x, on the wire, in Postgres, in the room
// history that lives in RAM (#207), and in the JSON.parse/stringify either
// side of all three.
//
// That ratio matters because the count is not bounded by anything the user
// perceives. The brush is sized in world units and dab spacing follows the
// brush, so the number of dabs tracks a stroke's *world* length — the same
// hand movement at 10% zoom covers ten times the world distance and costs ten
// times the dabs. Zooming out is exactly when a teacher sketches broadly.
//
// Base64 inside the operation's JSON rather than a real binary field:
// `Operation.data` is a Prisma `Json` column and the operation travels through
// socket.io, the log, undo/redo and the snapshot path as one plain object.
// Threading a separate binary attachment through all of that would buy back
// the 33% base64 overhead at the cost of touching every one of those seams —
// and with perMessageDeflate now on (#366), that overhead is largely
// recovered on the wire anyway, since base64 of packed floats still
// compresses.

/** Order fields are written in. Changing it changes the format — see
 *  DAB_PACK_VERSION. */
const FIELDS = [
  'x', 'y', 'pressure', 'tiltX', 'tiltY', 'size', 'aspectRatio', 'angle', 'opacity', 't',
] as const satisfies ReadonlyArray<keyof Dab>

const FLOATS_PER_DAB = FIELDS.length
const BYTES_PER_DAB = FLOATS_PER_DAB * 4

/** Bumped only if the layout above changes incompatibly. Written as a prefix
 *  on every packed payload so a client meeting an encoding it does not know
 *  says so instead of silently painting garbage — the log is permanent, and a
 *  room recorded today gets replayed by clients built much later. Costs two
 *  characters per stroke, not per dab. */
export const DAB_PACK_VERSION = 1

// float32, not float64, and that is a real (if tiny) loss rather than pure
// repacking: dab values are computed in double precision and rounded here.
// Worst case is world coordinates, where float32 resolves ~0.008 units at a
// magnitude of 100 000 — far below a pixel, and far below the sub-pixel
// sampling error #303 is about. It is safe for *consistency* regardless of
// size: every participant decodes the same rounded numbers, so no two clients
// can drift apart from this. Doubles would halve the saving for precision
// nothing downstream can express.
//
// Explicitly little-endian on both sides rather than letting Float32Array
// take the platform's byte order. Every target in practice is little-endian,
// but "in practice" is not a property to bake into a permanent log format
// that clients on unknown future hardware must read.
const LITTLE_ENDIAN = true

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked rather than one spread call: a long stroke is tens of thousands
  // of bytes and String.fromCharCode(...bytes) blows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Packs dabs into the base64 form a StrokeOperation carries. */
export function packDabs(dabs: Dab[]): string {
  const buffer = new ArrayBuffer(dabs.length * BYTES_PER_DAB)
  const view = new DataView(buffer)
  let offset = 0
  for (const dab of dabs) {
    for (const field of FIELDS) {
      view.setFloat32(offset, dab[field], LITTLE_ENDIAN)
      offset += 4
    }
  }
  return `${DAB_PACK_VERSION}:${toBase64(new Uint8Array(buffer))}`
}

/** Inverse of packDabs. Throws on a payload that is not a whole number of
 *  dabs — that means a truncated or foreign encoding, and painting the
 *  prefix of it would put content on the canvas that nobody drew. */
export function unpackDabs(packed: string): Dab[] {
  const separator = packed.indexOf(':')
  const version = separator === -1 ? NaN : Number(packed.slice(0, separator))
  if (version !== DAB_PACK_VERSION) {
    throw new Error(`packed dabs: unknown encoding version ${packed.slice(0, Math.max(separator, 0)) || '(none)'}`)
  }
  const bytes = fromBase64(packed.slice(separator + 1))
  if (bytes.length % BYTES_PER_DAB !== 0) {
    throw new Error(`packed dabs: ${bytes.length} bytes is not a multiple of ${BYTES_PER_DAB}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dabs: Dab[] = []
  let offset = 0
  for (let i = 0; i < bytes.length / BYTES_PER_DAB; i++) {
    const dab = {} as Dab
    for (const field of FIELDS) {
      dab[field] = view.getFloat32(offset, LITTLE_ENDIAN)
      offset += 4
    }
    dabs.push(dab)
  }
  return dabs
}
