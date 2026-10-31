// @grafetto/shared — the contract between the web client and the server.
// One module per domain (#613); this file is only the table of contents.

export * from './layers.js'
export * from './paper.js'
export * from './room.js'
export * from './roomRasterVersion.js'
export * from './toolset.js'
export * from './stroke.js'
export * from './layerOperations.js'
export * from './areaOperations.js'
export * from './shapes.js'
export * from './layerFilters.js'
export * from './operations.js'
export * from './annotations.js'
export * from './protocol.js'
export * from './hotkeys.js'
export * from './rest.js'
export * from './roomOpen.js'

// (#366) Stroke dab encoding — see dabCodec.ts.
export { DAB_PACK_VERSION, packDabs, strokeDabs, unpackDabs } from './dabCodec.js'

export type {
  AdminActionList, AdminActionRow, AdminDevice, AdminIpBan, AdminIpBanList, AdminIpDetail, AdminLessonList,
  AdminLessonRow, AdminLiveLesson, AdminOverview, AdminUserDetail, AdminUserFilter, AdminUserIp, AdminUserLesson,
  AdminUserList, AdminUserRow, ClientEnvironment, IpBanDurationHours,
} from './admin.js'
export { IP_BAN_DURATIONS_HOURS, sanitizeClientEnvironment } from './admin.js'

export * from './brushes.js'
export * from './brushBehavior.js'

export * from './brushCurves.js'

export * from './strokeEndSample.js'

export * from './brushRandom.js'

export * from './sourceStampData.js'

export * from './canonicalMaterialCodec.js'

export * from './sourceImageTransformAffine.js'

export * from './sourcePngGeometry.js'

export * from './sourcePngPyramid.js'

export * from './sourceImageTransformMetadata.js'

export * from './sourceAffineImageSpan16Coordinates.js'

export * from './canonicalMaterialGeometry.js'

export * from './canonicalStrokeFrame.js'

export * from './canonicalBrushCapability.js'

export * from './canonicalStrokeOperation.js'

export * from './sourceAutoGeometry.js'
export * from './sourceFmaF64.js'
export * from './sourceFmaF64Reference.js'

export * from './canonicalDefaultAutoMaterial.js'

export * from './canonicalSoftAutoMaterial.js'

export * from './canonicalRecordedAttachment.js'

export * from './canonicalRecordedPrefix.js'

export * from './canonicalStrokeClose.js'

export * from './canonicalEmptyHistoryBase.js'
