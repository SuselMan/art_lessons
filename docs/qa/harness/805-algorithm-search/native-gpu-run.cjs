'use strict';
/** Owned-device GPU timing. No GPU is opened when importing or using --self-test. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { openOwned, readBuild, hash } = require('./owned-loader.cjs');
const { bridge, seven, validateResult } = require('./native-mini-direct-run.cjs');
const { normalizeScene } = require('./gallery-normalize.cjs');
const GROUP_IDS = ['ungrouped', 'prepare', 'selection', 'paths', 'transport', 'assemble', 'background', 'protect'];
const SIZE = 1024;
const SHA = /^[a-f0-9]{64}$/;

function outputHashes(value) {
  assert.deepEqual(Object.keys(value).sort(), ['c', 'coverage', 'p']);
  for (const valueSHA of Object.values(value)) assert.match(valueSHA, SHA);
  return value;
}
function validateExpected(expected, fixture) {
  assert.equal(expected.contract, 'native-direct-source-to-full-C-v1');
  for (const key of ['pass', 'contextClosed', 'sourceStable', 'repeatExact', 'deviceLocalPair']) assert.equal(expected[key], true, 'Baseline ' + key);
  assert.equal(expected.request.fixture, fixture);
  assert.equal(expected.request.profile, 'original', 'Only observer-free original baseline');
  assert.ok(Array.isArray(expected.errors) && expected.errors.length === 0, 'Baseline browser errors');
  const sourceSHA = seven(expected.sourceSHA);
  assert.ok(Array.isArray(expected.hashes) && expected.hashes.length >= 3, 'Baseline needs at least three exact repeats');
  const outputSHA = outputHashes(expected.hashes[0]);
  for (const value of expected.hashes) assert.deepEqual(outputHashes(value), outputSHA, 'Baseline repeated output differs');
  assert.equal(expected.evidence.length, expected.hashes.length, 'Missing baseline repeat evidence');
  const metadataSHA = expected.evidence[0].metadataSHA;
  assert.match(metadataSHA, SHA);
  for (const row of expected.evidence) {
    assert.deepEqual(seven(row.sourceSHA), sourceSHA);
    assert.deepEqual(seven(row.sourceSHAAfter), sourceSHA);
    assert.equal(row.metadataSHA, metadataSHA);
    assert.equal(row.profile.id, 'original');
  }
  assert.equal(expected.bootstrap.profile.id, 'original');
  assert.equal(expected.bootstrap.profile.interactivePath, 'native-direct');
  assert.ok(typeof expected.bootstrap.renderer === 'string' && expected.bootstrap.renderer.length > 0);
  assert.match(expected.replay.replay.operationSHA, SHA);
  assert.ok(expected.replay.rawSHA && Object.keys(expected.replay.rawSHA).length > 0);
  for (const value of Object.values(expected.replay.rawSHA)) assert.ok(value === 'absent' || (typeof value === 'string' && SHA.test(value)), 'Raw replay hash/sentinel');
  for (const sample of expected.samples) assert.equal(sample.readBytes, SIZE * SIZE * 4, 'Baseline size');
  assert.equal(expected.samples.length, expected.hashes.length);
  return { outputSHA: { ...outputSHA }, sourceSHA: { ...sourceSHA }, sourceSHAAfter: { ...sourceSHA }, sourceUnchanged: true, metadataSHA };
}
function validateGpu(gpu, mode) {
  assert.ok(mode === 'whole' || mode === 'groups', 'Mode must be whole/groups');
  assert.equal(gpu.mode, mode);
  assert.equal(gpu.disjoint, false, 'Disjoint GPU timing');
  assert.equal(gpu.baselineCompared, true, 'GPU helper did not compare baseline');
  assert.ok(Number.isInteger(gpu.counterBits) && gpu.counterBits > 0 && gpu.counterBits <= 64, 'GPU elapsed counter');
  assert.ok(Number.isFinite(gpu.pollWallMs) && gpu.pollWallMs >= 0, 'GPU polling wall time');
  assert.ok(Number.isInteger(gpu.eventsSeen) && gpu.eventsSeen > 0, 'Missing GPU semantic events');
  assert.deepEqual(gpu.intervals.map(row => row.id), mode === 'whole' ? ['whole'] : GROUP_IDS, 'GPU interval count/order');
  let sum = 0;
  for (const row of gpu.intervals) {
    assert.ok(typeof row.label === 'string' && row.label.length > 0, 'GPU label');
    assert.ok(typeof row.scope === 'string' && row.scope.length > 0, 'GPU scope');
    assert.ok(Number.isSafeInteger(row.gpuNs) && row.gpuNs > 0, 'GPU positive nanoseconds');
    assert.ok(Number.isFinite(row.gpuMs) && row.gpuMs > 0, 'GPU positive milliseconds');
    assert.ok(Math.abs(row.gpuNs / 1e6 - row.gpuMs) <= 1e-9, 'GPU units disagree');
    sum += row.gpuMs;
  }
  assert.ok(Number.isFinite(gpu.totalGpuMs) && gpu.totalGpuMs > 0, 'GPU total');
  assert.ok(Math.abs(sum - gpu.totalGpuMs) <= Math.max(1e-9, sum * 1e-9), 'GPU interval sum');
  assert.ok(typeof gpu.scope === 'string' && gpu.scope.length > 0);
  assert.ok(typeof gpu.qualification === 'string' && gpu.qualification.length > 0);
}
function validateGpuResult(result, baseline, mode) {
  assert.equal(result.type, 'qa-native-gpu');
  validateGpu(result.gpu, mode);
  assert.deepEqual(outputHashes(result.outputSHA), baseline.outputSHA, 'GPU instrumentation changed output');
  assert.equal(result.metadataSHA, baseline.metadataSHA, 'GPU instrumentation changed metadata');
  for (const key of ['size', 'width', 'height']) if (result[key] !== undefined) assert.equal(result[key], SIZE, 'Output dimensions');
  // Reuse the byte, seven-source, orientation and host-clock checks unchanged.
  return validateResult({ ...result, type: 'qa-native-direct' }, baseline.sourceSHA, 'original');
}
function validateReplay(replay, expected, operationSHA) {
  assert.equal(replay.replay.operationSHA, operationSHA, 'Canonical operation SHA');
  assert.equal(replay.replay.operationSHA, expected.replay.replay.operationSHA, 'Paired operation SHA');
  assert.deepEqual(replay.rawSHA, expected.replay.rawSHA, 'Device-local raw replay differs');
}
function schedule(repeats) {
  assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10, 'QA_REPEATS must be1..10');
  const jobs = [{ phase: 'warmup', mode: 'whole', repeat: 0 }, { phase: 'warmup', mode: 'groups', repeat: 0 }];
  for (let repeat = 1; repeat <= repeats; repeat++) for (const mode of ['whole', 'groups']) jobs.push({ phase: 'measured', mode, repeat });
  return jobs;
}
async function main() {
  const { QA_BUILD: build, QA_OUTPUT: output, QA_DURABLE: durable, QA_EXPECTED: expectedFile } = process.env;
  assert.ok(build && output && durable && expectedFile, 'QA_BUILD/QA_OUTPUT/QA_DURABLE/QA_EXPECTED required');
  assert.ok(process.env.QA_DEVICE_LOCAL_PAIR === undefined || process.env.QA_DEVICE_LOCAL_PAIR === '1', 'GPU timing is always a strict device-local pair');
  assert.ok(process.env.QA_SAVE_C === undefined || ['0', '1'].includes(process.env.QA_SAVE_C), 'QA_SAVE_C must be0/1');
  const fixture = process.env.QA_SCENE || 'mini-two-colors', jobs = schedule(Number(process.env.QA_REPEATS || 5));
  const expectedBytes = fs.readFileSync(expectedFile), expected = JSON.parse(expectedBytes), baseline = validateExpected(expected, fixture);
  const immutable = readBuild(build), manifest = immutable.manifest;
  assert.equal(manifest.nativeMiniUI, true);
  assert.equal(manifest.nativeMiniOptimized, false, 'Measure original algorithm only');
  assert.equal(manifest.nativeAnatomy, true, 'GPU semantic-observer build required');
  const proofBytes = fs.readFileSync(path.join(durable, 'native/report.json')), proofReport = JSON.parse(proofBytes);
  const proof = proofReport.cases.find(row => row.pass && row.request.fixture === fixture && row.request.arm === 'original');
  assert.ok(proof && proof.repeatExact && proof.proofs.length >= 3, 'Certified authored operations required');
  const scenes = ['gallery-scenes-source.json', 'mini-scenes-source.json'].flatMap(name => JSON.parse(fs.readFileSync(path.join(__dirname, '../../runs/805-night-20261017', name))).scenes).map(normalizeScene);
  assert.equal(new Set(scenes.map(row => row.id)).size, scenes.length, 'Duplicate scene ID');
  const scene = scenes.find(row => row.id === fixture);
  assert.ok(scene, 'Known authored scene required');
  assert.equal(scene.transform.size, SIZE);
  assert.deepEqual(scene.transform.paperWorld, [SIZE, SIZE]);
  // normalizeScene hashes authored JSON; runtime hashes its replay representation.
  // Bind those representations through the actual replay, never equate their hashes.
  const canonicalReplayOperationSHA = proof.replay.replay.operationSHA;
  assert.match(canonicalReplayOperationSHA, SHA);
  assert.equal(canonicalReplayOperationSHA, expected.replay.replay.operationSHA);
  if (fs.existsSync(output)) assert.equal(fs.readdirSync(output).length, 0, 'Use an empty owned output directory');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
    contract: 'native-gpu-timeline-v1', request: { fixture, profile: 'original', repeats: jobs.filter(job => job.mode === 'whole' && job.phase === 'measured').length },
    deviceLocalPair: true, sourceQualification: 'Exact paired source/output on this renderer; NOT cross-device identity',
    dimensions: { width: SIZE, height: SIZE, channels: 4, bytes: SIZE * SIZE * 4, rows: 'gl-bottom-up' },
    expectedReportSHA: hash(expectedBytes), authoredProofReportSHA: hash(proofBytes), buildManifestSHA: hash(fs.readFileSync(path.join(build, 'manifest.json'))),
    sourceHashes: immutable.hashes, sourceSHA: baseline.sourceSHA, baseline, authoredOperationsJSONSHA: scene.operationSHA, canonicalReplayOperationSHA,
    regime: { schedule: jobs, note: 'One warmup per mode, then alternating whole/groups; all rows retained. Independent sequential queries, never nested. Host clocks are reported separately. GPU elapsed includes possible CPU-induced idle, not shader-active utilization.' },
    warmups: [], samples: [], hashes: [], evidence: [], pass: false
  };
  const save = () => { const temporary = path.join(output, 'report.pending'); fs.writeFileSync(temporary, JSON.stringify(report, null, 2), { mode: 0o600 }); fs.renameSync(temporary, path.join(output, 'report.json')); };
  let own;
  save();
  try {
    own = await openOwned(build);
    await own.page('Page.addScriptToEvaluateOnNewDocument', { source: '(' + bridge.toString() + ')()' });
    await own.navigate('mode=worker&nativeGpu=' + encodeURIComponent(fixture));
    const deadline = Date.now() + 20000;
    let snapshot;
    while (!(snapshot = await own.evaluate('window.__workerMiniQA?.snapshot()'))?.ready) {
      if (snapshot?.error) throw Error(snapshot.error);
      if (Date.now() > deadline) throw Error('GPU Mini bootstrap20s');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(snapshot.bootstrap.profile.id, 'original');
    assert.equal(snapshot.bootstrap.profile.skipEmptyMobile, false);
    assert.equal(snapshot.bootstrap.profile.interactivePath, 'native-direct');
    assert.ok(snapshot.bootstrap.profile.sourceBuild);
    assert.equal(snapshot.bootstrap.renderer, expected.bootstrap.renderer, 'Baseline renderer mismatch');
    report.bootstrap = snapshot.bootstrap;
    const replay = await own.evaluate('__nativeDirectRequest(' + JSON.stringify({ type: 'qa-replay-scene', operations: scene.operations, capture: false }) + ')');
    validateReplay(replay, expected, canonicalReplayOperationSHA);
    report.replay = replay;
    save();
    for (const job of jobs) {
      report.pending = job; save();
      const result = await own.evaluate('__nativeDirectRequest(' + JSON.stringify({ type: 'qa-run-native-gpu', mode: job.mode, baseline }) + ')');
      report.lastAttempt = { ...job, gpu: result.gpu, outputSHA: result.outputSHA, sourceSHA: result.sourceSHA, sourceSHAAfter: result.sourceSHAAfter, metadataSHA: result.metadataSHA };
      const bytes = validateGpuResult(result, baseline, job.mode);
      const row = { ...job, gpu: result.gpu, hostSample: result.sample, outputSHA: result.outputSHA };
      if (job.phase === 'warmup') report.warmups.push(row);
      else {
        report.samples.push(row); report.hashes.push(result.outputSHA);
        if (process.env.QA_SAVE_C === '1' && !report.output) {
          const packed = zlib.gzipSync(bytes, { level: 6 }), file = 'native-C.rgba.gz';
          fs.writeFileSync(path.join(output, file), packed, { mode: 0o600 });
          report.output = { file, gzipSHA256: hash(packed), sha256: hash(bytes), bytes: bytes.length, rows: 'gl-bottom-up' };
        }
      }
      report.evidence.push({ ...job, sourceSHA: result.sourceSHA, sourceSHAAfter: result.sourceSHAAfter, metadataSHA: result.metadataSHA, profile: result.profile });
      delete report.pending; delete report.lastAttempt; save();
    }
    report.repeatExact = true; report.allOutputsMatchBaseline = true; report.pass = true;
  } catch (error) {
    report.failure = String(error.stack || error).replace(/https?:\/\/\S+/g, '[owned-url]');
  } finally {
    if (own) {
      try { own.verifySource(); report.sourceStable = true; } catch (error) { report.sourceStable = false; report.pass = false; report.sourceFailure = String(error); }
      report.errors = [...own.errors]; if (report.errors.length) report.pass = false;
      try { await own.close(); report.contextClosed = true; } catch (error) { report.contextClosed = false; report.pass = false; report.closeFailure = String(error); }
    }
    if (!report.pass) process.exitCode = 1;
    save();
    console.log(JSON.stringify({ fixture, pass: report.pass, measuredRows: report.samples.length, warmups: report.warmups.length, failure: report.failure }));
  }
  return report;
}
function selfTest() {
  const { test } = require('node:test');
  const sourceSHA = Object.fromEntries(['p', 'c', 'coverage', 'solvent', 'foreign', 'original', 'paper'].map(key => [key, 'a'.repeat(64)]));
  const bytes = Buffer.alloc(SIZE * SIZE * 4), outputSHA = { p: 'b'.repeat(64), c: hash(bytes), coverage: 'c'.repeat(64) }, metadataSHA = 'd'.repeat(64);
  const baseline = { sourceSHA, sourceSHAAfter: sourceSHA, outputSHA, metadataSHA, sourceUnchanged: true };
  const gpuRow = mode => ({ mode, counterBits: 64, disjoint: false, baselineCompared: true, pollWallMs: 0, eventsSeen: 30, scope: 'Native core', qualification: 'GPU timeline, may include CPU idle', intervals: (mode === 'groups' ? GROUP_IDS : ['whole']).map(id => ({ id, label: id, scope: id, gpuNs: 1000000, gpuMs: 1 })), totalGpuMs: mode === 'groups' ? 8 : 1 });
  const result = () => ({ type: 'qa-native-gpu', profile: { id: 'original' }, rows: 'gl-bottom-up', ...baseline, gpu: gpuRow('groups'), sample: { coreHostMs: 2, fullCReadMs: 3, totalToFullCMs: 5, readBytes: bytes.length, glError: 0, scope: 'NO CPU component wrapper' }, outputData: 'data:application/octet-stream;base64,' + bytes.toString('base64') });
  const expected = () => ({ contract: 'native-direct-source-to-full-C-v1', request: { fixture: 'mini-two-colors', profile: 'original' }, pass: true, contextClosed: true, sourceStable: true, repeatExact: true, deviceLocalPair: true, errors: [], sourceSHA, hashes: [outputSHA, outputSHA, outputSHA], evidence: Array.from({ length: 3 }, () => ({ sourceSHA, sourceSHAAfter: sourceSHA, metadataSHA, profile: { id: 'original' } })), samples: Array.from({ length: 3 }, () => ({ readBytes: bytes.length })), bootstrap: { renderer: 'actual-test-renderer', profile: { id: 'original', interactivePath: 'native-direct' } }, replay: { replay: { operationSHA: 'e'.repeat(64) }, rawSHA: { p: 'f'.repeat(64) } } });
  test('accept independent whole query and eight ordered groups', () => { validateGpu(gpuRow('whole'), 'whole'); validateGpu(gpuRow('groups'), 'groups'); });
  test('reject disjoint, unpaired, missing, reordered, zero, invalid units and sum', () => {
    for (const change of [gpu => gpu.disjoint = true, gpu => gpu.baselineCompared = false, gpu => gpu.intervals.pop(), gpu => gpu.intervals.reverse(), gpu => gpu.intervals[0].gpuNs = 0, gpu => gpu.intervals[0].gpuNs = Number.MAX_SAFE_INTEGER + 1, gpu => gpu.intervals[0].gpuMs = Infinity, gpu => gpu.intervals[0].gpuMs = 2, gpu => gpu.totalGpuMs = 4, gpu => gpu.counterBits = 0, gpu => gpu.pollWallMs = -1, gpu => gpu.eventsSeen = 0]) { const gpu = gpuRow('groups'); change(gpu); assert.throws(() => validateGpu(gpu, 'groups')); }
  });
  test('require closed observer-free device-local baseline and stable complete evidence', () => {
    assert.deepEqual(validateExpected(expected(), 'mini-two-colors'), baseline);
    for (const change of [row => row.deviceLocalPair = false, row => row.contextClosed = false, row => row.request.profile = 'optimized', row => row.evidence[1].metadataSHA = 'f'.repeat(64), row => row.samples[0].readBytes = 4, row => row.hashes.pop(), row => row.errors.push('error')]) { const row = expected(); change(row); assert.throws(() => validateExpected(row, 'mini-two-colors')); }
  });
  test('bind full output bytes, dimensions, metadata, source and host clock to baseline', () => {
    assert.equal(validateGpuResult(result(), baseline, 'groups').length, bytes.length);
    for (const change of [row => row.width = 512, row => row.metadataSHA = 'f'.repeat(64), row => row.outputSHA = { ...outputSHA, p: 'e'.repeat(64) }, row => row.sourceSHAAfter = { ...sourceSHA, paper: 'f'.repeat(64) }, row => row.sample.totalToFullCMs = 6, row => row.outputData = 'data:application/octet-stream;base64,AA==']) { const row = result(); change(row); assert.throws(() => validateGpuResult(row, baseline, 'groups')); }
  });
  test('canonical operation identity and local replay must both match', () => {
    const row = expected(); validateReplay(row.replay, row, 'e'.repeat(64));
    assert.throws(() => validateReplay(row.replay, row, 'f'.repeat(64)));
    assert.throws(() => validateReplay({ ...row.replay, rawSHA: { p: 'a'.repeat(64) } }, row, 'e'.repeat(64)));
  });
  test('one separate warmup per mode and five alternating measured pairs', () => {
    const jobs = schedule(5); assert.equal(jobs.length, 12); assert.equal(jobs.filter(row => row.phase === 'warmup').length, 2); assert.deepEqual(jobs.map(row => row.mode), Array.from({ length: 6 }, () => ['whole', 'groups']).flat());
    for (const value of [0, -1, 11, 1.5, NaN]) assert.throws(() => schedule(value));
  });
}
if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { validateExpected, validateGpu, validateGpuResult, validateReplay, schedule, GROUP_IDS, main };
