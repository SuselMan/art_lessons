'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { openOwned, readBuild, hash } = require('./owned-loader.cjs');
const { seven, validateResult } = require('./native-mini-direct-run.cjs');
const { validateExpected } = require('./native-gpu-run.cjs');
const { fixtures } = require('../../prototypes/native-expansion-805/fixtures.cjs');
const SIZE = 1024, PIXELS = SIZE * SIZE, RGBA = PIXELS * 4, RADIUS = 24;
const ARMS = ['original', 'smooth', 'noisy'], SHA = /^[a-f0-9]{64}$/;

function bridge() {
  const NativeWorker = Worker, pending = new Map(); let worker, sequence = 0;
  globalThis.Worker = new Proxy(NativeWorker, { construct(Target, args) {
    worker = Reflect.construct(Target, args, Target);
    worker.addEventListener('message', async event => {
      const row = event.data, request = pending.get(row?.requestId); if (!request) return;
      event.stopImmediatePropagation(); pending.delete(row.requestId); clearTimeout(request.timer);
      if (row.type === 'qa-scene-error' || row.type === 'error') return request.reject(Error(row.message));
      try {
        const output = { ...row };
        for (const [blobKey, dataKey] of [['outputBlob', 'outputData'], ['inputBlob', 'inputData'], ['imageBlob', 'imageData']]) {
          if (!row[blobKey]) continue;
          output[dataKey] = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(row[blobKey]); });
          delete output[blobKey];
        }
        delete output.blob; request.resolve(output);
      } catch (error) { request.reject(error); }
    }, true);
    return worker;
  } });
  globalThis.__expansionRequest = message => new Promise((resolve, reject) => {
    if (!worker) return reject(Error('Owned worker not created'));
    const requestId = 'native-expansion-' + (++sequence), timer = setTimeout(() => { pending.delete(requestId); reject(Error('Expansion request timeout45s')); }, 45000);
    pending.set(requestId, { resolve, reject, timer }); worker.postMessage({ ...message, requestId });
  });
}
function schedule(repeats) {
  assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10, 'QA_REPEATS must be1..10');
  const jobs = ARMS.map(arm => ({ phase: 'warmup', repeat: 0, arm }));
  for (let repeat = 1; repeat <= repeats; repeat++) for (let position = 0; position < 3; position++) jobs.push({ phase: 'measured', repeat, arm: ARMS[(repeat - 1 + position) % 3] });
  return jobs;
}
function decodeData(value, bytes) {
  assert.match(value, /^data:[^,]*;base64,/);
  const output = Buffer.from(value.split(',')[1], 'base64'); assert.equal(output.length, bytes, 'Binary byte length'); return output;
}
function validateInput(reply) {
  assert.equal(reply.type, 'qa-expansion-input');
  assert.deepEqual(reply.layout, { size: SIZE, commonBytes: PIXELS * 6, nativeCBytes: RGBA, commonRows: 'top-left', nativeCRows: 'gl-bottom-up' });
  const bytes = decodeData(reply.inputData, PIXELS * 10), manifest = reply.manifest;
  assert.equal(manifest.nativeMaterialModel, 'front8-detail-flow-v4');
  assert.equal(manifest.conversion, 'native-optical-depth-linear'); assert.equal(manifest.rawRows, 'gl-bottom-up'); assert.equal(manifest.inputRows, 'top-left');
  assert.ok(Number.isFinite(manifest.pigmentScale) && manifest.pigmentScale > 0 && manifest.pigmentScale <= 1, 'Fixed input pigment scale');
  assert.deepEqual(Object.keys(manifest.commonSHA).sort(), ['paper', 'rgba', 'water']);
  const rgba = bytes.subarray(0, RGBA), water = bytes.subarray(RGBA, RGBA + PIXELS), paper = bytes.subarray(RGBA + PIXELS, PIXELS * 6), nativeC = bytes.subarray(PIXELS * 6);
  for (const [key, plane] of Object.entries({ rgba, water, paper })) { assert.match(manifest.commonSHA[key], SHA); assert.equal(hash(plane), manifest.commonSHA[key], 'Input common ' + key); }
  for (const key of ['inkColor', 'solvent', 'paperHeightRGBA']) assert.match(manifest.rawSHA[key], SHA);
  assert.equal(hash(nativeC), manifest.rawSHA.inkColor, 'Input native C hash');
  if (manifest.rawSHA.foreignSolvent !== undefined) assert.match(manifest.rawSHA.foreignSolvent, SHA);
  return { bytes, rgba, water, paper, nativeC, manifest, layout: reply.layout, sha256: hash(bytes) };
}
function bindInputToSource(input, sourceSHA, rawReplay) {
  seven(sourceSHA);
  assert.equal(input.manifest.rawSHA.inkColor, sourceSHA.c);
  assert.equal(input.manifest.rawSHA.solvent, sourceSHA.solvent);
  assert.equal(input.manifest.rawSHA.paperHeightRGBA, sourceSHA.paper);
  const absent = hash(Buffer.alloc(RGBA));
  assert.equal(input.manifest.rawSHA.foreignSolvent ?? absent, sourceSHA.foreign);
  for (const [raw, key] of [['p', 'p'], ['c', 'c'], ['coverage', 'coverage'], ['water', 'solvent'], ['foreignWater', 'foreign'], ['original', 'original']]) {
    const value = rawReplay[raw]; assert.ok(value === 'absent' || (typeof value === 'string' && SHA.test(value)), 'Raw replay proof ' + raw);
    assert.equal(value === 'absent' ? absent : value, sourceSHA[key], 'Replay source binding ' + raw);
  }
}
function validateGpu(gpu) {
  assert.equal(gpu.mode, 'whole'); assert.equal(gpu.disjoint, false); assert.equal(gpu.baselineCompared, false, 'Candidate helper must not claim equivalence to original');
  assert.ok(Number.isInteger(gpu.counterBits) && gpu.counterBits > 0 && gpu.counterBits <= 64);
  assert.ok(Number.isFinite(gpu.pollWallMs) && gpu.pollWallMs >= 0);
  assert.ok(Number.isInteger(gpu.eventsSeen) && gpu.eventsSeen > 0);
  assert.deepEqual(gpu.intervals.map(row => row.id), ['whole']);
  const interval = gpu.intervals[0];
  assert.ok(Number.isSafeInteger(interval.gpuNs) && interval.gpuNs > 0);
  assert.ok(Number.isFinite(interval.gpuMs) && interval.gpuMs > 0);
  assert.ok(Math.abs(interval.gpuMs - interval.gpuNs / 1e6) <= 1e-9);
  assert.ok(Number.isFinite(gpu.totalGpuMs) && Math.abs(gpu.totalGpuMs - interval.gpuMs) <= 1e-9);
  for (const text of [interval.label, interval.scope, gpu.scope, gpu.qualification]) assert.ok(typeof text === 'string' && text.length > 0);
}
function auditOutput(input, output) {
  assert.equal(input.nativeC.length, RGBA); assert.equal(input.water.length, PIXELS); assert.equal(output.length, RGBA);
  const inputSum = [0, 0, 0, 0], outputSum = [0, 0, 0, 0]; let dryChangedPixels = 0, wetChangedPixels = 0, newPaintPixels = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4, wet = input.water[(SIZE - 1 - y) * SIZE + x] > 0; let changed = false;
    for (let c = 0; c < 4; c++) { inputSum[c] += input.nativeC[i + c]; outputSum[c] += output[i + c]; if (input.nativeC[i + c] !== output[i + c]) changed = true; }
    if (changed) { if (wet) wetChangedPixels++; else dryChangedPixels++; }
    if (wet && input.nativeC[i + 3] === 0 && output[i + 3] > 0) newPaintPixels++;
  }
  return { dryChangedPixels, wetChangedPixels, newPaintPixels, inputSum, outputSum, channelRatios: inputSum.map((sum, i) => sum ? outputSum[i] / sum : null) };
}
function validateResponse(row, arm, pin, armProof, input) {
  assert.equal(row.type, 'qa-native-expansion'); assert.equal(row.arm, arm); assert.ok(ARMS.includes(arm));
  assert.equal(row.sourceUnchanged, true); assert.match(row.metadataSHA, SHA); validateGpu(row.gpu);
  const expectedSource = pin?.sourceSHA ?? seven(row.sourceSHA), output = validateResult({ ...row, type: 'qa-native-direct' }, expectedSource, 'original');
  if (pin) { assert.equal(row.metadataSHA, pin.metadataSHA, 'Source metadata changed'); if (arm === 'original') assert.deepEqual(row.outputSHA, pin.outputSHA, 'Original output changed after candidate'); }
  if (armProof) assert.deepEqual(row.outputSHA, armProof.outputSHA, 'Within-arm output changed');
  if (arm === 'original') { assert.equal(row.config.id, 'original'); assert.equal(row.config.model, 'front8-detail-flow-v4'); assert.equal(row.stats, null); }
  else {
    assert.equal(row.config.id, arm + '-expansion'); assert.equal(row.config.radiusPx, RADIUS); assert.equal(row.config.fixedInitialWater, true); assert.equal(row.config.allWetMobile, false);
    assert.equal(row.stats.coreCalls, 1); for (const key of ['frontDraws', 'outwardDraws', 'inwardDraws']) assert.ok(Number.isInteger(row.stats[key]) && row.stats[key] > 0, 'Candidate executed ' + key);
    assert.equal(row.stats.frontDraws, row.stats.outwardDraws + row.stats.inwardDraws);
  }
  if (armProof) { assert.deepEqual(row.config, armProof.config, 'Configuration changed between repeats'); assert.deepEqual(row.stats, armProof.stats, 'Draw counts changed between repeats'); }
  const audit = auditOutput(input, output); assert.equal(audit.dryChangedPixels, 0, 'Independent dry pixel audit');
  for (const key of Object.keys(audit)) assert.deepEqual(row.audit[key], audit[key], 'Independent audit ' + key);
  assert.ok(typeof row.audit.qualification === 'string' && row.audit.qualification.length > 0);
  return { output, audit };
}
function gzipFile(directory, name, bytes) {
  const packed = zlib.gzipSync(bytes, { level: 6 }); fs.writeFileSync(path.join(directory, name), packed, { mode: 0o600 });
  return { file: name, bytes: bytes.length, sha256: hash(bytes), gzipSHA256: hash(packed) };
}
async function main() {
  const { QA_BUILD: build, QA_OUTPUT: output } = process.env; assert.ok(build && output, 'QA_BUILD and QA_OUTPUT required');
  const all = fixtures(), fixture = process.env.QA_SCENE || 'mini-two-colors', scene = all.find(row => row.id === fixture), jobs = schedule(Number(process.env.QA_REPEATS || 5));
  assert.ok(scene, 'Known already-normalized fixture required'); assert.equal(new Set(all.map(row => row.id)).size, all.length);
  assert.equal(scene.transform.size, SIZE); assert.equal(scene.operationSHA, hash(JSON.stringify(scene.operations)), 'Authored operation JSON SHA');
  const immutable = readBuild(build), manifest = immutable.manifest;
  for (const key of ['nativeMiniUI', 'nativeAnatomy', 'nativeExpansion']) assert.equal(manifest[key], true, 'Build flag ' + key);
  assert.equal(manifest.nativeMiniOptimized, false);
  let expected, expectedBytes, expectedProof;
  if (process.env.QA_EXPECTED) { expectedBytes = fs.readFileSync(process.env.QA_EXPECTED); expected = JSON.parse(expectedBytes); expectedProof = validateExpected(expected, fixture); }
  if (fs.existsSync(output)) assert.equal(fs.readdirSync(output).length, 0, 'Use empty owned QA_OUTPUT');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'native-expansion-805-v1', request: { fixture, radiusPx: RADIUS, contrastSelection: 'original-Q-unchanged', repeats: Number(process.env.QA_REPEATS || 5) }, synthetic: scene.synthetic, fixtureQualification: scene.qualification || 'Authored gallery/mini scene', operationJSONSHA: scene.operationSHA, operations: scene.operations, sourceHashes: immutable.hashes, buildManifestSHA: hash(fs.readFileSync(path.join(build, 'manifest.json'))), expectedReportSHA: expectedBytes ? hash(expectedBytes) : null, deviceLocalPair: true, regime: { schedule: jobs, qualification: 'One warmup per arm, then cyclic O/S/N → S/N/O → N/O/S. Original Q selection is retained; only path construction changes. Each original equals the local original proof; candidates only require exact repeats within their own arm. All source/input/export/audit work outside clocks.' }, warmups: [], samples: [], outputs: {}, pass: false };
  const save = () => { const pending = path.join(output, 'report.pending'); fs.writeFileSync(pending, JSON.stringify(report, null, 2), { mode: 0o600 }); fs.renameSync(pending, path.join(output, 'report.json')); };
  let own, input, pin; const armProofs = new Map(); save();
  try {
    own = await openOwned(build); await own.page('Page.addScriptToEvaluateOnNewDocument', { source: '(' + bridge.toString() + ')()' });
    await own.navigate('mode=worker&nativeExpansion=' + encodeURIComponent(fixture));
    const deadline = Date.now() + 20000; let snapshot;
    while (!(snapshot = await own.evaluate('window.__workerMiniQA?.snapshot()'))?.ready) { if (snapshot?.error) throw Error(snapshot.error); if (Date.now() > deadline) throw Error('Expansion bootstrap20s'); await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(snapshot.bootstrap.profile.id, 'original'); assert.equal(snapshot.bootstrap.profile.skipEmptyMobile, false); assert.equal(snapshot.bootstrap.profile.interactivePath, 'native-direct'); assert.ok(snapshot.bootstrap.profile.sourceBuild);
    assert.ok(typeof snapshot.bootstrap.renderer === 'string' && snapshot.bootstrap.renderer.length > 0);
    if (expected) assert.equal(snapshot.bootstrap.renderer, expected.bootstrap.renderer, 'Expected renderer differs'); report.bootstrap = snapshot.bootstrap;
    const replay = await own.evaluate('__expansionRequest(' + JSON.stringify({ type: 'qa-replay-scene', operations: scene.operations, capture: false }) + ')');
    assert.equal(replay.type, 'qa-scene-ready'); assert.match(replay.replay.operationSHA, SHA); report.actualReplayOperationSHA = replay.replay.operationSHA; report.replay = replay;
    if (expected) { assert.equal(replay.replay.operationSHA, expected.replay.replay.operationSHA); assert.deepEqual(replay.rawSHA, expected.replay.rawSHA); }
    const captured = await own.evaluate('__expansionRequest({type:"qa-expansion-input"})'); input = validateInput(captured);
    assert.deepEqual(captured.manifest, replay.manifest, 'Input capture differs from replay capture');
    report.input = { ...gzipFile(output, 'native-input.rgba-water-paper-C.gz', input.bytes), layout: input.layout, manifest: input.manifest }; report.captureManifest = input.manifest; save();
    for (const job of jobs) {
      report.pending = job; save();
      const row = await own.evaluate('__expansionRequest(' + JSON.stringify({ type: 'qa-run-expansion', arm: job.arm, radiusPx: RADIUS }) + ')');
      report.lastAttempt = { ...job, gpu: row.gpu, sourceSHA: row.sourceSHA, sourceSHAAfter: row.sourceSHAAfter, metadataSHA: row.metadataSHA, outputSHA: row.outputSHA, audit: row.audit, config: row.config, stats: row.stats };
      const checked = validateResponse(row, job.arm, pin, armProofs.get(job.arm), input);
      if (!pin) { assert.equal(job.arm, 'original'); pin = { sourceSHA: { ...row.sourceSHA }, metadataSHA: row.metadataSHA, outputSHA: { ...row.outputSHA } }; bindInputToSource(input, pin.sourceSHA, replay.rawSHA); report.sourceSHA = pin.sourceSHA; report.originalProof = pin; }
      if (expectedProof) { assert.deepEqual(row.sourceSHA, expectedProof.sourceSHA); assert.equal(row.metadataSHA, expectedProof.metadataSHA); if (job.arm === 'original') assert.deepEqual(row.outputSHA, expectedProof.outputSHA, 'Original differs from prior Vega baseline'); }
      if (!armProofs.has(job.arm)) armProofs.set(job.arm, { outputSHA: row.outputSHA, config: row.config, stats: row.stats });
      const evidence = { ...job, gpu: row.gpu, hostSample: row.sample, outputSHA: row.outputSHA, sourceSHA: row.sourceSHA, sourceSHAAfter: row.sourceSHAAfter, sourceUnchanged: row.sourceUnchanged, metadataSHA: row.metadataSHA, profile: row.profile, config: row.config, stats: row.stats, audit: row.audit, independentAudit: checked.audit };
      if (job.phase === 'warmup') report.warmups.push(evidence);
      else { report.samples.push(evidence); if (!report.outputs[job.arm]) report.outputs[job.arm] = { ...gzipFile(output, job.arm + '-C.rgba.gz', checked.output), rows: 'gl-bottom-up', size: SIZE, outputSHA: row.outputSHA }; }
      delete report.pending; delete report.lastAttempt; save();
    }
    report.repeatExactByArm = true; report.sourceUnchanged = true; report.dryPixelsUnchanged = true; report.pass = true;
  } catch (error) { report.failure = String(error.stack || error).replace(/https?:\/\/\S+/g, '[owned-url]'); }
  finally {
    if (own) {
      try { own.verifySource(); report.sourceStable = true; } catch (error) { report.sourceStable = false; report.pass = false; report.sourceFailure = String(error); }
      report.errors = [...own.errors]; if (report.errors.length) report.pass = false;
      try { await own.close(); report.contextClosed = true; } catch (error) { report.contextClosed = false; report.pass = false; report.closeFailure = String(error); }
    }
    if (!report.pass) process.exitCode = 1; save(); console.log(JSON.stringify({ fixture, pass: report.pass, measuredRows: report.samples.length, warmups: report.warmups.length, failure: report.failure }));
  }
  return report;
}
function selfTest() {
  const { test } = require('node:test'), input = { nativeC: Buffer.alloc(RGBA), water: Buffer.alloc(PIXELS) };
  const sourceSHA = Object.fromEntries(['p', 'c', 'coverage', 'solvent', 'foreign', 'original', 'paper'].map(key => [key, 'a'.repeat(64)])), metadataSHA = 'd'.repeat(64);
  const result = (arm = 'original') => {
    const output = Buffer.alloc(RGBA), gpu = { mode: 'whole', disjoint: false, baselineCompared: false, counterBits: 64, pollWallMs: 1, eventsSeen: 10, totalGpuMs: 1, intervals: [{ id: 'whole', gpuNs: 1000000, gpuMs: 1, label: 'whole', scope: 'whole' }], scope: 'GPU core', qualification: 'May include idle' };
    return { type: 'qa-native-expansion', arm, profile: { id: 'original' }, rows: 'gl-bottom-up', sourceUnchanged: true, sourceSHA: { ...sourceSHA }, sourceSHAAfter: { ...sourceSHA }, metadataSHA, outputSHA: { p: 'b'.repeat(64), c: hash(output), coverage: 'c'.repeat(64) }, outputData: 'data:application/octet-stream;base64,' + output.toString('base64'), gpu, sample: { coreHostMs: 2, fullCReadMs: 3, totalToFullCMs: 5, readBytes: RGBA, glError: 0, scope: 'NO CPU component wrapper' }, config: arm === 'original' ? { id: 'original', model: 'front8-detail-flow-v4' } : { id: arm + '-expansion', radiusPx: RADIUS, fixedInitialWater: true, allWetMobile: false }, stats: arm === 'original' ? null : { coreCalls: 1, frontDraws: 4, outwardDraws: 2, inwardDraws: 2 }, audit: { ...auditOutput(input, output), qualification: 'Diagnostic channel sums' } };
  };
  const inputReply = () => {
    const bytes = Buffer.alloc(PIXELS * 10), rgba = bytes.subarray(0, RGBA), water = bytes.subarray(RGBA, RGBA + PIXELS), paper = bytes.subarray(RGBA + PIXELS, PIXELS * 6), nativeC = bytes.subarray(PIXELS * 6);
    return { type: 'qa-expansion-input', layout: { size: SIZE, commonBytes: PIXELS * 6, nativeCBytes: RGBA, commonRows: 'top-left', nativeCRows: 'gl-bottom-up' }, inputData: 'data:application/octet-stream;base64,' + bytes.toString('base64'), manifest: { nativeMaterialModel: 'front8-detail-flow-v4', conversion: 'native-optical-depth-linear', rawRows: 'gl-bottom-up', inputRows: 'top-left', pigmentScale: 1, commonSHA: { rgba: hash(rgba), water: hash(water), paper: hash(paper) }, rawSHA: { inkColor: hash(nativeC), solvent: hash(rgba), paperHeightRGBA: hash(rgba) } } };
  };
  test('cyclic order balances arm position and separates warmups', () => { const jobs = schedule(5); assert.equal(jobs.length, 18); assert.deepEqual(jobs.slice(0, 3).map(job => job.arm), ARMS); for (const arm of ARMS) assert.equal(jobs.filter(job => job.phase === 'measured' && job.arm === arm).length, 5); for (let position = 0; position < 3; position++) assert.equal(new Set(jobs.filter(job => job.phase === 'measured').slice(0, 9).filter((_, i) => i % 3 === position).map(job => job.arm)).size, 3); assert.throws(() => schedule(0)); });
  test('full input packet binds all four plane hashes and row orientations', () => { assert.equal(validateInput(inputReply()).bytes.length, PIXELS * 10); for (const change of [row => row.layout.size = 512, row => row.layout.commonRows = 'gl-bottom-up', row => row.manifest.commonSHA.water = 'b'.repeat(64), row => row.manifest.rawSHA.inkColor = 'b'.repeat(64)]) { const row = inputReply(); change(row); assert.throws(() => validateInput(row)); } });
  test('original and differing candidate outputs are allowed but repeats are strict', () => {
    const original = result(), pin = { sourceSHA, metadataSHA, outputSHA: original.outputSHA }; validateResponse(original, 'original', null, null, input);
    const candidate = result('smooth'); candidate.outputSHA.p = 'e'.repeat(64); validateResponse(candidate, 'smooth', pin, null, input);
    assert.throws(() => validateResponse(candidate, 'smooth', pin, { outputSHA: original.outputSHA }, input));
    original.outputSHA.p = 'e'.repeat(64); assert.throws(() => validateResponse(original, 'original', { ...pin, outputSHA: { ...pin.outputSHA, p: 'b'.repeat(64) } }, null, input));
  });
  test('reject changed source, disjoint, inactive candidate, bad audit and false host time', () => { for (const change of [row => row.sourceUnchanged = false, row => row.sourceSHAAfter.paper = 'b'.repeat(64), row => row.gpu.disjoint = true, row => row.gpu.baselineCompared = true, row => row.stats.coreCalls = 0, row => row.config.radiusPx = 12, row => row.config.allWetMobile = true, row => row.audit.dryChangedPixels = 1, row => row.sample.totalToFullCMs = 6]) { const row = result('noisy'); change(row); assert.throws(() => validateResponse(row, 'noisy', null, null, input)); } });
  test('independent wet mask audit applies correct top/bottom row conversion', () => { const nativeC = Buffer.alloc(RGBA), water = Buffer.alloc(PIXELS), output = Buffer.alloc(RGBA); water[0] = 1; output[((SIZE - 1) * SIZE) * 4 + 3] = 1; let audit = auditOutput({ nativeC, water }, output); assert.equal(audit.dryChangedPixels, 0); assert.equal(audit.wetChangedPixels, 1); assert.equal(audit.newPaintPixels, 1); output[3] = 1; audit = auditOutput({ nativeC, water }, output); assert.equal(audit.dryChangedPixels, 1); });
  test('actual four fixtures are already normalized with independent authored JSON hashes', () => { const list = fixtures(); assert.equal(list.length, 4); assert.equal(list.filter(row => row.synthetic).length, 2); for (const row of list) { assert.equal(row.transform.size, SIZE); assert.equal(row.operationSHA, hash(JSON.stringify(row.operations))); } });
}
if (require.main === module) { if (process.argv.includes('--self-test')) selfTest(); else main().catch(error => { console.error(error.message); process.exitCode = 1; }); }
module.exports = { main, bridge, schedule, validateInput, bindInputToSource, validateGpu, validateResponse, auditOutput };
