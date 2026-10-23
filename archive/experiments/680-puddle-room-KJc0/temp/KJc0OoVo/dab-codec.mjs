// packages/shared/src/dabCodec.ts
var FIELDS = [
  "x",
  "y",
  "pressure",
  "tiltX",
  "tiltY",
  "size",
  "aspectRatio",
  "angle",
  "opacity",
  "t"
];
var FLOATS_PER_DAB = FIELDS.length;
var BYTES_PER_DAB = FLOATS_PER_DAB * 4;
var DAB_PACK_VERSION = 1;
var LITTLE_ENDIAN = true;
function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}
function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function packDabs(dabs) {
  const buffer = new ArrayBuffer(dabs.length * BYTES_PER_DAB);
  const view = new DataView(buffer);
  let offset = 0;
  for (const dab of dabs) {
    for (const field of FIELDS) {
      view.setFloat32(offset, dab[field], LITTLE_ENDIAN);
      offset += 4;
    }
  }
  return `${DAB_PACK_VERSION}:${toBase64(new Uint8Array(buffer))}`;
}
function unpackDabs(packed) {
  const separator = packed.indexOf(":");
  const version = separator === -1 ? NaN : Number(packed.slice(0, separator));
  if (version !== DAB_PACK_VERSION) {
    throw new Error(`packed dabs: unknown encoding version ${packed.slice(0, Math.max(separator, 0)) || "(none)"}`);
  }
  const bytes = fromBase64(packed.slice(separator + 1));
  if (bytes.length % BYTES_PER_DAB !== 0) {
    throw new Error(`packed dabs: ${bytes.length} bytes is not a multiple of ${BYTES_PER_DAB}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dabs = [];
  let offset = 0;
  for (let i = 0; i < bytes.length / BYTES_PER_DAB; i++) {
    const dab = {};
    for (const field of FIELDS) {
      dab[field] = view.getFloat32(offset, LITTLE_ENDIAN);
      offset += 4;
    }
    dabs.push(dab);
  }
  return dabs;
}
function strokeDabs(op) {
  if (op.dabs) return op.dabs;
  return op.dabsPacked ? unpackDabs(op.dabsPacked) : [];
}
export {
  DAB_PACK_VERSION,
  packDabs,
  strokeDabs,
  unpackDabs
};
