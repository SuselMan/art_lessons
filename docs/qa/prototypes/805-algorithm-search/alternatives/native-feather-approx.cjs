'use strict';
// QA approximation: front-local call sites only; never rewrite wcFbm itself.
const NATIVE = 'wcFbm((px + u_paperOrigin) * WC_FRONT_FEATHER_SCALE + vec2(41.0, 7.0))';
const PREFIX = 'wcFbm((px+u_paperOrigin)*WC_FRONT_FEATHER_SCALE+vec2(41.0,7.0))';
function replaceUnique(source, anchor, label) {
  if (typeof source !== 'string') throw new TypeError(`${label}: source must be a string`);
  if (source.split(anchor).length !== 2) throw new Error(`${label}: expected exactly one original feather anchor`);
  return source.replace(anchor, anchor.replace('wcFbm(', 'wcNoise('));
}
function transformNativeFeatherSource(source) { return replaceUnique(source, NATIVE, 'native feather'); }
function transformPrefixFeatherSource(source) { return replaceUnique(source, PREFIX, 'prefix feather'); }
// Validate both before returning either, so build callers cannot accidentally publish a half pair.
function transformFrontFeatherPair(nativeSource, prefixSource) {
  const native = transformNativeFeatherSource(nativeSource);
  const prefix = transformPrefixFeatherSource(prefixSource);
  return Object.freeze({native, prefix});
}
module.exports = {transformNativeFeatherSource, transformPrefixFeatherSource, transformFrontFeatherPair};
