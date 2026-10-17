/** QA approximation: only the unique native front feather call, not wcFbm's definition. */
export function transformNativeFeatherSource(source: string): string
/** Accepts the TS prefix module or a compiled GLSL containing its unique unitEdge body. */
export function transformPrefixFeatherSource(source: string): string
/** Build must publish both transformed modules together; throws on either anchor drift. */
export function transformFrontFeatherPair(nativeSource: string, prefixSource: string): Readonly<{native: string; prefix: string}>
