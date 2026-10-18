'use strict';
/** Separate untimed native-canvas image export; never a timing result. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { openOwned, readBuild, hash } = require('./owned-loader.cjs');
const { bridge, validateGpu } = require('./native-expansion-run.cjs');
const { seven, validateResult } = require('./native-mini-direct-run.cjs');
const { fixtures } = require('../../prototypes/native-expansion-805/fixtures.cjs');
const { pngDimensions } = require('../../prototypes/native-expansion-805/build-compare.cjs');
const ARMS = ['original', 'smooth', 'noisy'], SHA = /^[a-f0-9]{64}$/;
function hashes(value) { assert.deepEqual(Object.keys(value).sort(), ['c', 'coverage', 'p']); for (const sha of Object.values(value)) assert.match(sha, SHA); return value; }
function validateExpected(expected, fixture) {
  assert.equal(expected.contract, 'native-expansion-805-v1');
  for (const key of ['pass', 'contextClosed', 'sourceStable', 'repeatExactByArm', 'sourceUnchanged', 'dryPixelsUnchanged']) assert.equal(expected[key], true, 'Expected report ' + key);
  assert.deepEqual(expected.errors, []); assert.equal(expected.request.fixture, fixture); assert.equal(expected.request.radiusPx, 24);
  assert.ok(Number.isInteger(expected.request.repeats) && expected.request.repeats > 0);
  seven(expected.sourceSHA); assert.deepEqual(expected.originalProof.sourceSHA, expected.sourceSHA); assert.match(expected.originalProof.metadataSHA, SHA);
  assert.match(expected.operationJSONSHA, SHA); assert.match(expected.actualReplayOperationSHA, SHA);
  assert.ok(typeof expected.bootstrap.renderer === 'string' && expected.bootstrap.renderer.length > 0);
  const samples = {};
  for (const arm of ARMS) {
    const rows = expected.samples.filter(row => row.arm === arm && row.phase === 'measured');
    assert.equal(rows.length, expected.request.repeats, 'Expected measured repeats ' + arm);
    const output = expected.outputs[arm]; hashes(output.outputSHA); assert.equal(output.sha256, output.outputSHA.c); assert.equal(output.bytes, 4194304); assert.equal(output.rows, 'gl-bottom-up');
    for (const row of rows) {
      assert.deepEqual(hashes(row.outputSHA), output.outputSHA, 'Expected output repeat ' + arm);
      assert.deepEqual(seven(row.sourceSHA), expected.sourceSHA); assert.deepEqual(seven(row.sourceSHAAfter), expected.sourceSHA);
      assert.equal(row.sourceUnchanged, true); assert.equal(row.metadataSHA, expected.originalProof.metadataSHA); assert.equal(row.audit.dryChangedPixels, 0);
    }
    samples[arm] = rows[0];
  }
  assert.deepEqual(expected.originalProof.outputSHA, expected.outputs.original.outputSHA);
  return samples;
}
function validateCalculation(row, arm, expected, baseline) {
  assert.equal(row.type, 'qa-native-expansion'); assert.equal(row.arm, arm); validateGpu(row.gpu);
  // Validate the actual binary C and source proofs, but do not retain these clocks as image-export performance.
  validateResult({ ...row, type: 'qa-native-direct' }, expected.sourceSHA, 'original');
  assert.deepEqual(hashes(row.outputSHA), expected.outputs[arm].outputSHA, 'Image replay changed native output ' + arm);
  assert.equal(row.metadataSHA, expected.originalProof.metadataSHA); assert.deepEqual(row.config, baseline.config); assert.deepEqual(row.stats, baseline.stats);
  assert.equal(row.audit.dryChangedPixels, 0); for (const key of ['dryChangedPixels', 'wetChangedPixels', 'newPaintPixels', 'inputSum', 'outputSum', 'channelRatios']) assert.deepEqual(row.audit[key], baseline.audit[key], 'Image replay audit ' + key);
}
function validatePng(row, kind, outputSHA, expectedDimensions) {
  assert.equal(row.type, 'qa-expansion-png'); assert.equal(row.kind, kind);
  assert.match(row.imageData, /^data:image\/png;base64,/);
  const bytes = Buffer.from(row.imageData.split(',')[1], 'base64'), dimensions = pngDimensions(bytes);
  if (kind === 'goal') assert.deepEqual(hashes(row.outputSHA), outputSHA, 'PNG target proof differs from measured native output');
  else assert.equal(row.outputSHA, undefined, 'Input PNG must precede target calculation');
  if (expectedDimensions) assert.deepEqual(dimensions, expectedDimensions, 'Native canvas dimensions changed');
  if (row.width !== undefined) assert.equal(row.width, dimensions.width); if (row.height !== undefined) assert.equal(row.height, dimensions.height);
  assert.ok(typeof row.qualification === 'string' && row.qualification.length > 0);
  return { bytes, dimensions, sha256: hash(bytes) };
}
async function main() {
  const { QA_BUILD: build, QA_OUTPUT: output, QA_EXPECTED: expectedFile } = process.env; assert.ok(build && output && expectedFile, 'QA_BUILD/QA_OUTPUT/QA_EXPECTED required');
  const expectedBytes = fs.readFileSync(expectedFile), expected = JSON.parse(expectedBytes), fixture = process.env.QA_SCENE || expected.request.fixture, baselines = validateExpected(expected, fixture);
  const scene = fixtures().find(row => row.id === fixture); assert.ok(scene); assert.equal(scene.operationSHA, expected.operationJSONSHA); assert.equal(hash(JSON.stringify(scene.operations)), expected.operationJSONSHA);
  const immutable = readBuild(build); for (const key of ['nativeMiniUI', 'nativeAnatomy', 'nativeExpansion']) assert.equal(immutable.manifest[key], true); assert.equal(immutable.manifest.nativeMiniOptimized, false);
  if (fs.existsSync(output)) assert.equal(fs.readdirSync(output).length, 0, 'Use an empty owned output directory'); fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'native-expansion-images-805-v1', request: { fixture, arms: ARMS }, expectedReportSHA: hash(expectedBytes), buildManifestSHA: hash(fs.readFileSync(path.join(build, 'manifest.json'))), sourceHashes: immutable.hashes, renderer: expected.bootstrap.renderer, operationJSONSHA: scene.operationSHA, actualReplayOperationSHA: expected.actualReplayOperationSHA, sourceSHA: expected.sourceSHA, metadataSHA: expected.originalProof.metadataSHA, qualification: 'Separate untimed actual native Mini canvas PNG exports. New original/smooth/noisy contexts. Every native output matches its measured arm P/C/coverage. No alternative compositor or output normalization. Performance comes only from the separate expected report.', timingUsed: false, contexts: [], images: {}, pass: false };
  const save = () => { const pending = path.join(output, 'report.pending'); fs.writeFileSync(pending, JSON.stringify(report, null, 2), { mode: 0o600 }); fs.renameSync(pending, path.join(output, 'report.json')); };
  const writePng = (name, png, extra = {}) => { const file = name + '.png'; fs.writeFileSync(path.join(output, file), png.bytes, { mode: 0o600 }); report.images[name] = { file, sha256: png.sha256, bytes: png.bytes.length, ...png.dimensions, ...extra }; save(); };
  let dimensions; save();
  try {
    for (const arm of ARMS) {
      let own; const context = { arm, contextClosed: false, sourceStable: false, errors: [], pass: false }; report.contexts.push(context); save();
      try {
        own = await openOwned(build); await own.page('Page.addScriptToEvaluateOnNewDocument', { source: '(' + bridge.toString() + ')()' }); await own.navigate('mode=worker&nativeExpansionImages=' + encodeURIComponent(fixture) + '&arm=' + arm);
        const deadline = Date.now() + 20000; let snapshot;
        while (!(snapshot = await own.evaluate('window.__workerMiniQA?.snapshot()'))?.ready) { if (snapshot?.error) throw Error(snapshot.error); if (Date.now() > deadline) throw Error('Native PNG bootstrap20s'); await new Promise(resolve => setTimeout(resolve, 100)); }
        assert.equal(snapshot.bootstrap.renderer, expected.bootstrap.renderer); assert.equal(snapshot.bootstrap.profile.id, 'original'); assert.equal(snapshot.bootstrap.profile.skipEmptyMobile, false); assert.equal(snapshot.bootstrap.profile.interactivePath, 'native-direct'); context.bootstrap = snapshot.bootstrap;
        const replay = await own.evaluate('__expansionRequest(' + JSON.stringify({ type: 'qa-replay-scene', operations: scene.operations, capture: false }) + ')'); assert.equal(replay.type, 'qa-scene-ready'); assert.equal(replay.replay.operationSHA, expected.actualReplayOperationSHA); assert.deepEqual(replay.rawSHA, expected.replay.rawSHA); context.actualReplayOperationSHA = replay.replay.operationSHA; context.rawSHA = replay.rawSHA;
        if (arm === 'original') { const row = await own.evaluate('__expansionRequest({type:"qa-expansion-png",kind:"input"})'), png = validatePng(row, 'input'); dimensions = png.dimensions; writePng('input', png, { kind: 'input', sourceSHA: expected.sourceSHA, qualification: row.qualification }); }
        const calculated = await own.evaluate('__expansionRequest(' + JSON.stringify({ type: 'qa-run-expansion', arm, radiusPx: 24 }) + ')'); validateCalculation(calculated, arm, expected, baselines[arm]); context.outputSHA = calculated.outputSHA; context.metadataSHA = calculated.metadataSHA; context.sourceSHA = calculated.sourceSHA; context.sourceSHAAfter = calculated.sourceSHAAfter;
        const row = await own.evaluate('__expansionRequest({type:"qa-expansion-png",kind:"goal"})'), png = validatePng(row, 'goal', expected.outputs[arm].outputSHA, dimensions); writePng(arm, png, { kind: 'goal', outputSHA: row.outputSHA, nativeCSHA: row.outputSHA.c, qualification: row.qualification }); context.pass = true;
      } finally {
        if (own) {
          try { own.verifySource(); context.sourceStable = true; } catch (error) { context.sourceFailure = String(error); context.pass = false; }
          context.errors = [...own.errors]; if (context.errors.length) context.pass = false;
          try { await own.close(); context.contextClosed = true; } catch (error) { context.closeFailure = String(error); context.pass = false; }
        }
        save();
      }
      assert.equal(context.pass, true, 'Native PNG context validation/cleanup failed ' + arm);
    }
    assert.deepEqual(Object.keys(report.images).sort(), ['input', 'noisy', 'original', 'smooth']); report.pass = true;
  } catch (error) { report.failure = String(error.stack || error).replace(/https?:\/\/\S+/g, '[owned-url]'); }
  finally {
    report.contextClosed = report.contexts.length > 0 && report.contexts.every(row => row.contextClosed);
    report.sourceStable = report.contexts.length > 0 && report.contexts.every(row => row.sourceStable);
    report.errors = report.contexts.flatMap(row => row.errors);
    if (!report.contextClosed || !report.sourceStable || report.errors.length) report.pass = false;
    if (!report.pass) process.exitCode = 1; save(); console.log(JSON.stringify({ fixture, pass: report.pass, imageCount: Object.keys(report.images).length, contextClosed: report.contextClosed, sourceStable: report.sourceStable, failure: report.failure }));
  }
  return report;
}
function selfTest() {
  const { test } = require('node:test'), outputSHA = { p: 'a'.repeat(64), c: 'b'.repeat(64), coverage: 'c'.repeat(64) };
  const image = kind => { const header = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header); header.writeUInt32BE(13, 8); header.write('IHDR', 12); header.writeUInt32BE(1024, 16); header.writeUInt32BE(1024, 20); return { type: 'qa-expansion-png', kind, imageData: 'data:image/png;base64,' + header.toString('base64'), qualification: 'Native canvas', ...(kind === 'goal' ? { outputSHA } : {}) }; };
  test('PNG protocol validates image dimensions and exact measured goal hashes', () => { assert.deepEqual(validatePng(image('goal'), 'goal', outputSHA).dimensions, { width: 1024, height: 1024 }); assert.equal(validatePng(image('input'), 'input').bytes.length, 33); });
  test('reject wrong kind, output, dimensions and non-PNG', () => { for (const change of [row => row.kind = 'input', row => row.outputSHA = { ...outputSHA, c: 'd'.repeat(64) }, row => row.width = 512, row => row.imageData = 'data:image/jpeg;base64,AA==']) { const row = image('goal'); change(row); assert.throws(() => validatePng(row, 'goal', outputSHA, { width: 1024, height: 1024 })); } });
  test('input cannot claim an already computed goal', () => { const row = image('input'); row.outputSHA = outputSHA; assert.throws(() => validatePng(row, 'input')); });
  test('shared bridge forwards image blobs but never prints binary data', () => { const source = bridge.toString(); assert.match(source, /imageBlob/); assert.match(source, /imageData/); assert.doesNotMatch(source, /console\./); });
}
if (require.main === module) { if (process.argv.includes('--self-test')) selfTest(); else main().catch(error => { console.error(error.message); process.exitCode = 1; }); }
module.exports = { main, validateExpected, validateCalculation, validatePng };
