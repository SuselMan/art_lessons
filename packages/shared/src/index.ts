// @grafetto/shared — the contract between the web client and the server.
// One module per domain (#613); this file is only the table of contents.

export * from './layers.js'
export * from './paper.js'
export * from './room.js'
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
