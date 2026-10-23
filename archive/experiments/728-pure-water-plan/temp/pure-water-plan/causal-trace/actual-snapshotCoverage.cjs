"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// apps/server/src/rooms/snapshotCoverage.ts
var snapshotCoverage_exports = {};
__export(snapshotCoverage_exports, {
  RESIDENT_OP_TYPES: () => RESIDENT_OP_TYPES,
  deletableOperations: () => deletableOperations,
  isCoveredBySnapshot: () => isCoveredBySnapshot,
  layerStateIdsOf: () => layerStateIdsOf,
  residentOperationWhere: () => residentOperationWhere
});
module.exports = __toCommonJS(snapshotCoverage_exports);

// packages/shared/src/paper.ts
var PAPER_COARSENESS = ["coarse", "medium", "fine"];
var PAPER_GRAIN_TYPES = PAPER_COARSENESS;
var PAPER_TYPES = [...PAPER_GRAIN_TYPES, "flat"];
function paperCoarsenessOf(type) {
  const head = type.split("-")[0];
  return PAPER_COARSENESS.includes(head) ? head : null;
}
var DEFAULT_PAPER_COLOR_BY_COARSENESS = {
  coarse: "#faf8f4",
  medium: "#fcfbf9",
  fine: "#fdfdfc"
};
function defaultPaperColor(type) {
  const coarseness = paperCoarsenessOf(type);
  return coarseness ? DEFAULT_PAPER_COLOR_BY_COARSENESS[coarseness] : "#fcfcfa";
}
var DEFAULT_PAPER_COLORS = Object.fromEntries(PAPER_TYPES.map((t) => [t, defaultPaperColor(t)]));

// packages/shared/src/annotations.ts
var ANNOTATION_OP_TYPES = ["annotation_add", "annotation_update", "annotation_delete"];
function isAnnotationOperation(op) {
  return ANNOTATION_OP_TYPES.includes(op.type);
}

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

// packages/shared/src/admin.ts
var IP_BAN_DURATIONS_HOURS = [1, 24, 24 * 7, 24 * 30];

// apps/server/src/rooms/snapshotCoverage.ts
function deletableOperations(coveredSeqByLayer, operations, layerStateSeq = null, layerStateIds = null) {
  return operations.filter((op) => isCoveredBySnapshot(coveredSeqByLayer, op, layerStateSeq, layerStateIds));
}
var RESIDENT_OP_TYPES = [
  "layer_add",
  "folder_add",
  "layer_delete",
  "layer_merge",
  "layer_duplicate",
  "layer_owner_lock",
  "operation_undo",
  "operation_redo",
  "operation_revoke",
  // (#508) The annotation operations, and they are resident for a reason no
  // other entry here has: they are the only ones whose effect *nothing* else
  // stores. A layer's existence survives in the stored layerState and its
  // pixels in a snapshot, so those entries are resident to keep the server's
  // own mirrors honest; an annotation exists only as the operations that made
  // it. Drop one below the window and the remark is gone from the room for
  // good, with the log row still sitting in Postgres.
  ...ANNOTATION_OP_TYPES
];
function layerStateIdsOf(state) {
  if (typeof state !== "object" || state === null) return null;
  const items = state.items;
  if (typeof items !== "object" || items === null) return null;
  return new Set(Object.keys(items));
}
var COVERABLE_OP_TYPES = [
  "stroke",
  "image_import",
  "layer_clear",
  "area_transform",
  "area_clear",
  "area_paste",
  "area_fill",
  "shape",
  "layer_filter"
];
function isCoverableOp(op) {
  return COVERABLE_OP_TYPES.includes(op.type);
}
function isCoveredBySnapshot(coveredSeqByLayer, op, layerStateSeq = null, layerStateIds = null, now = Date.now(), targetOf) {
  const seq = op.seq ?? 0;
  if (op.type === "operation_undo" || op.type === "operation_redo" || op.type === "operation_revoke") {
    const target = targetOf?.(op.targetOpId);
    if (target) return isCoveredBySnapshot(coveredSeqByLayer, { ...target, seq }, layerStateSeq, layerStateIds, now);
  }
  const structureCovered = layerStateSeq !== null && seq <= layerStateSeq;
  const pixelsCovered = (layerId) => seq <= (coveredSeqByLayer.get(layerId) ?? 0) || structureCovered && layerStateIds !== null && !layerStateIds.has(layerId);
  if (isCoverableOp(op)) return pixelsCovered(op.layerId);
  if (op.type === "layer_merge") return structureCovered && pixelsCovered(op.layerId);
  if (op.type === "layer_duplicate") return structureCovered && pixelsCovered(op.layerId);
  if (op.type === "layer_transform") return structureCovered && op.transforms.every((t) => pixelsCovered(t.layerId));
  if (isAnnotationOperation(op)) return false;
  if (op.type === "paper_dry") return false;
  return structureCovered;
}
function residentOperationWhere(roomId, coveredSeqByLayer) {
  const covered = [...coveredSeqByLayer].map(([layerId, seq]) => ({ layerId, seq: { lte: seq } }));
  if (covered.length === 0) return { roomId };
  return { roomId, NOT: { type: { in: COVERABLE_OP_TYPES }, OR: covered } };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RESIDENT_OP_TYPES,
  deletableOperations,
  isCoveredBySnapshot,
  layerStateIdsOf,
  residentOperationWhere
});
