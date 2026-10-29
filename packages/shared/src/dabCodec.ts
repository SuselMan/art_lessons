import type { Dab, StrokeOperation } from './stroke.js'

// (#366) Compact encoding for a stroke operation's dab array.
//
// A legacy dab is ten numbers; v2 optionally adds a captured normalized speed.
// Serialized as JSON it measures ~250 bytes — a figure
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

/** Maximum supported layout. Encoding remains v1 when speed is absent on all
 * dabs. V2 adds one float, with -1 meaning absent only on the wire (mixed data).
 * Zero means a measured zero and must never be treated as missing.
 * V3 adds optional source allocation size and deterministic Size response.
 * The two source channels use -1 for absence; encoding remains v1/v2 otherwise.
 * V4 adds a float64 raw source angle; positive Infinity means absent only on
 * the wire. Every finite angle, including -1 and zero, remains representable.
 * V5 adds float64 author elapsed milliseconds with the same absent sentinel.
 * Versions 1–4 retain their exact layouts when no sourceTime is present.
 * Bumped only if the layout above changes incompatibly. Written as a prefix
 *  on every packed payload so a client meeting an encoding it does not know
 *  says so instead of silently painting garbage — the log is permanent, and a
 *  room recorded today gets replayed by clients built much later. Costs two
 *  characters per stroke, not per dab. */
export const DAB_PACK_VERSION = 5

// float32, not float64, and that is a real (if tiny) loss rather than pure
// repacking: dab values are computed in double precision and rounded here.
// Worst case is world coordinates, where float32 resolves ~0.008 units at a
// magnitude of 100 000 — far below a pixel, and far below the sub-pixel
// sampling error #303 is about. It is safe for *consistency* regardless of
// size: every participant decodes the same rounded numbers, so no two clients
// can drift apart from this. Doubles would halve the saving for precision
// nothing downstream can express. Source angle is the explicit exception:
// its F64 value participates in integer allocation before rasterization.
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

/** Optional recorded source request inputs; zero scale is distinct from absence. */
export function isDabSourceSize(value: unknown): value is number {
  return typeof value==='number' && Number.isFinite(value) && Math.fround(value)>0 && value<=100000
}
export function isDabSourceAngle(value: unknown): value is number {
  return typeof value==='number' && Number.isFinite(value)
}
export function isDabSourceTime(value: unknown): value is number {
  return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=Number.MAX_SAFE_INTEGER
}
export function isDabSourceScale(value: unknown): value is number {
  return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=1
}

/** Packs dabs into the base64 form a StrokeOperation carries. */
export function packDabs(dabs: Dab[]): string {
  const source=dabs.some(dab=>dab.sourceSize!==undefined || dab.sourceScale!==undefined)
  const version=dabs.some(dab=>dab.sourceTime!==undefined)?5:dabs.some(dab=>dab.sourceAngle!==undefined)?4:source?3:dabs.some(dab=>dab.normalizedSpeed!==undefined)?2:1
  const stride=BYTES_PER_DAB+(version>=2?4:0)+(version>=3?8:0)+(version>=4?8:0)+(version>=5?8:0)
  const buffer = new ArrayBuffer(dabs.length * stride)
  const view = new DataView(buffer)
  let offset = 0
  for (const dab of dabs) {
    for (const field of FIELDS) {
      view.setFloat32(offset, dab[field], LITTLE_ENDIAN)
      offset += 4
    }
    if(version>=2){
      const speed=dab.normalizedSpeed
      if(speed!==undefined && (!Number.isFinite(speed)||speed<0||speed>1))throw new Error('packed dabs: invalid normalized speed')
      view.setFloat32(offset,speed??-1,LITTLE_ENDIAN)
      offset+=4
    }
    if(version>=3){
      if(dab.sourceSize!==undefined && !isDabSourceSize(dab.sourceSize))throw new Error('packed dabs: invalid source size')
      if(dab.sourceScale!==undefined && !isDabSourceScale(dab.sourceScale))throw new Error('packed dabs: invalid source scale')
      view.setFloat32(offset,dab.sourceSize??-1,LITTLE_ENDIAN);offset+=4
      view.setFloat32(offset,dab.sourceScale??-1,LITTLE_ENDIAN);offset+=4
    }
    if(version>=4){
      if(dab.sourceAngle!==undefined && !isDabSourceAngle(dab.sourceAngle))throw new Error('packed dabs: invalid source angle')
      view.setFloat64(offset,dab.sourceAngle??Infinity,LITTLE_ENDIAN);offset+=8
    }
    if(version>=5){
      if(dab.sourceTime!==undefined && !isDabSourceTime(dab.sourceTime))throw new Error('packed dabs: invalid source time')
      view.setFloat64(offset,dab.sourceTime??Infinity,LITTLE_ENDIAN);offset+=8
    }
  }
  return `${version}:${toBase64(new Uint8Array(buffer))}`
}

/** Inverse of packDabs. Throws on a payload that is not a whole number of
 *  dabs — that means a truncated or foreign encoding, and painting the
 *  prefix of it would put content on the canvas that nobody drew. */
export function unpackDabs(packed: string): Dab[] {
  const separator = packed.indexOf(':')
  const version = separator === -1 ? NaN : Number(packed.slice(0, separator))
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== DAB_PACK_VERSION) {
    throw new Error(`packed dabs: unknown encoding version ${packed.slice(0, Math.max(separator, 0)) || '(none)'}`)
  }
  const bytes = fromBase64(packed.slice(separator + 1))
  const stride=BYTES_PER_DAB+(version>=2?4:0)+(version>=3?8:0)+(version>=4?8:0)+(version>=5?8:0)
  if (bytes.length % stride !== 0) {
    throw new Error(`packed dabs: ${bytes.length} bytes is not a multiple of ${stride}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dabs: Dab[] = []
  let offset = 0
  for (let i = 0; i < bytes.length / stride; i++) {
    const dab = {} as Dab
    for (const field of FIELDS) {
      dab[field] = view.getFloat32(offset, LITTLE_ENDIAN)
      offset += 4
    }
    if(version>=2){
      const speed=view.getFloat32(offset,LITTLE_ENDIAN);offset+=4
      if(speed!==-1){
        if(!Number.isFinite(speed)||speed<0||speed>1)throw new Error('packed dabs: invalid normalized speed')
        dab.normalizedSpeed=speed
      }
    }
    if(version>=3){
      const size=view.getFloat32(offset,LITTLE_ENDIAN);offset+=4
      const scale=view.getFloat32(offset,LITTLE_ENDIAN);offset+=4
      if(size!==-1){if(!isDabSourceSize(size))throw new Error('packed dabs: invalid source size');dab.sourceSize=size}
      if(scale!==-1){if(!isDabSourceScale(scale))throw new Error('packed dabs: invalid source scale');dab.sourceScale=scale}
    }
    if(version>=4){
      const angle=view.getFloat64(offset,LITTLE_ENDIAN);offset+=8
      if(angle!==Infinity){
        if(!isDabSourceAngle(angle))throw new Error('packed dabs: invalid source angle')
        dab.sourceAngle=angle
      }
    }
    if(version>=5){
      const time=view.getFloat64(offset,LITTLE_ENDIAN);offset+=8
      if(time!==Infinity){
        if(!isDabSourceTime(time))throw new Error('packed dabs: invalid source time')
        dab.sourceTime=time
      }
    }
    dabs.push(dab)
  }
  return dabs
}

/** The dabs of a stroke operation, whichever way it happens to carry them.
 *  Every consumer must go through this rather than reading `dabs` or
 *  `dabsPacked` — an operation from before #366 has only the former and one
 *  recorded since has only the latter, and both replay forever.
 *
 *  Decodes on each call rather than caching: replay paints an operation's
 *  dabs once and moves on, and the one caller that reads the same operation
 *  repeatedly (a peer's live-stroke reveal, which walks the array as time
 *  passes) holds its own reference to the result. */
export function strokeDabs(op: StrokeOperation): Dab[] {
  const plain=op.dabs
  if (plain) {
    for(const dab of plain){
      if(dab.sourceTime!==undefined && !isDabSourceTime(dab.sourceTime))throw new Error('plain dabs: invalid source time')
      if(dab.sourceAngle!==undefined && !isDabSourceAngle(dab.sourceAngle))throw new Error('plain dabs: invalid source angle')
      if(dab.sourceSize!==undefined && !isDabSourceSize(dab.sourceSize))throw new Error('plain dabs: invalid source size')
      if(dab.sourceScale!==undefined && !isDabSourceScale(dab.sourceScale))throw new Error('plain dabs: invalid source scale')
      const speed=dab.normalizedSpeed
      if(speed!==undefined && (!Number.isFinite(speed)||speed<0||speed>1))throw new Error('plain dabs: invalid normalized speed')
    }
    return plain
  }
  return op.dabsPacked ? unpackDabs(op.dabsPacked) : []
}

/** Binary scalar for endpoint metadata; uses the same explicit endian/base64 law. */
export function packEndpointBaseSize(value: number): string {
  const bytes=new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0,value,LITTLE_ENDIAN)
  return toBase64(bytes)
}
export function unpackEndpointBaseSize(text: string): number {
  const bytes=fromBase64(text)
  if(bytes.length!==8 || toBase64(bytes)!==text)throw Error('endpoint: invalid scalar')
  return new DataView(bytes.buffer).getFloat64(0,LITTLE_ENDIAN)
}
