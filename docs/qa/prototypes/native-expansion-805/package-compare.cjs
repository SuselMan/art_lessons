'use strict';
/** Assemble references to actual timed/native-PNG evidence; generate only water diagnostics. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { fixtures } = require('./fixtures.cjs');
const { png } = require('../../harness/805-algorithm-search/fixed-reference.cjs');
const { validateExpected } = require('../../harness/805-algorithm-search/native-expansion-images.cjs');
const { deriveMetrics, pngDimensions } = require('./build-compare.cjs');
const SIZE = 1024, PIXELS = SIZE * SIZE, RGBA = PIXELS * 4, SHA = /^[a-f0-9]{64}$/;
const ARMS = ['original', 'smooth', 'noisy'];
const LABELS = {
  'mini-two-colors': 'Два цвета в воде',
  'gallery-sheet-3-slot-1': 'Краска в готовой луже',
  'expansion-bridge': 'Узкая перемычка · искусственный тест',
  'expansion-dry-hole': 'Сухая дырка · искусственный тест'
};
const VARIANTS = {
  original: { label: 'Наш алгоритм', note: 'Исходный расчёт с обычным отбором краски.' },
  smooth: { label: 'Простые пути', note: 'Тот же отбор краски. Простой поиск путей внутри исходной воды, без шума.' },
  noisy: { label: 'Пути с шумом', note: 'Тот же отбор краски. Плавный шум делает пути растекания неоднородными.' }
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function reportFile(file) { const bytes = fs.readFileSync(file); return { file, bytes, sha256: hash(bytes), data: JSON.parse(bytes) }; }
function artifactFile(directory, descriptor) {
  assert.ok(descriptor && typeof descriptor.file === 'string' && descriptor.file.length > 0 && !path.isAbsolute(descriptor.file), 'Relative evidence file required');
  const root = path.resolve(directory), file = path.resolve(root, descriptor.file);
  assert.ok(file.startsWith(root + path.sep), 'Evidence artifact must remain within its own report directory');
  return file;
}
function checkedArtifact(directory, descriptor, hashKey = 'sha256') {
  assert.match(descriptor[hashKey], SHA); const file = artifactFile(directory, descriptor), bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), descriptor[hashKey], 'Artifact checksum ' + descriptor.file); return { file, bytes };
}
function validatePolicy(report) {
  assert.equal(report.request.contrastSelection, 'original-Q-unchanged', 'Only original Q selection is accepted');
  assert.equal(report.request.radiusPx, 24);
  for (const row of [...report.warmups, ...report.samples]) {
    assert.ok(ARMS.includes(row.arm)); assert.equal(row.sourceUnchanged, true); assert.equal(row.audit.dryChangedPixels, 0); assert.equal(row.independentAudit.dryChangedPixels, 0);
    if (row.arm === 'original') assert.equal(row.config.id, 'original');
    else { assert.equal(row.config.allWetMobile, false, 'All-wet selection is excluded'); assert.equal(row.config.fixedInitialWater, true); assert.equal(row.config.radiusPx, 24); }
  }
}
function readWater(timedDirectory, report) {
  const descriptor = report.input, packed = checkedArtifact(timedDirectory, descriptor, 'gzipSHA256');
  const bytes = zlib.gunzipSync(packed.bytes, { maxOutputLength: PIXELS * 10 });
  assert.equal(bytes.length, PIXELS * 10); assert.equal(descriptor.bytes, bytes.length); assert.equal(hash(bytes), descriptor.sha256);
  assert.deepEqual(descriptor.layout, { size: SIZE, commonBytes: PIXELS * 6, nativeCBytes: RGBA, commonRows: 'top-left', nativeCRows: 'gl-bottom-up' });
  const manifest = descriptor.manifest; assert.deepEqual(manifest, report.captureManifest); assert.equal(manifest.nativeMaterialModel, 'front8-detail-flow-v4');
  assert.equal(manifest.conversion, 'native-optical-depth-linear'); assert.equal(manifest.inputRows, 'top-left'); assert.equal(manifest.rawRows, 'gl-bottom-up');
  const water = bytes.subarray(RGBA, RGBA + PIXELS);
  for (const [name, plane] of [['rgba', bytes.subarray(0, RGBA)], ['water', water], ['paper', bytes.subarray(RGBA + PIXELS, PIXELS * 6)]]) assert.equal(hash(plane), manifest.commonSHA[name], 'Common input ' + name);
  assert.equal(hash(bytes.subarray(PIXELS * 6)), manifest.rawSHA.inkColor); assert.equal(manifest.rawSHA.inkColor, report.sourceSHA.c);
  return { water: Buffer.from(water), inputSHA256: descriptor.sha256, waterSHA256: manifest.commonSHA.water };
}
function waterPixels(water) {
  assert.equal(water.length, PIXELS); const pixels = Buffer.alloc(RGBA);
  for (let i = 0; i < PIXELS; i++) { const wet = water[i] > 0, offset = i * 4; pixels[offset] = wet ? 202 : 250; pixels[offset + 1] = wet ? 224 : 250; pixels[offset + 2] = wet ? 232 : 250; pixels[offset + 3] = 255; }
  return pixels;
}
function nativeImage(imagesDirectory, description) {
  const artifact = checkedArtifact(imagesDirectory, description), dimensions = pngDimensions(artifact.bytes);
  assert.equal(artifact.bytes.length, description.bytes);
  assert.deepEqual(dimensions, { width: SIZE, height: SIZE }, 'Native PNG must already be1024×1024; stop and report dimensions, never rescale');
  assert.deepEqual([description.width, description.height], [SIZE, SIZE]);
  return { file: artifact.file, sha256: description.sha256, width: SIZE, height: SIZE };
}
function packageComparison(evidenceRoot, outPackage) {
  assert.ok(evidenceRoot && outPackage, 'Usage: node package-compare.cjs evidenceRoot outPackage');
  const evidence = path.resolve(evidenceRoot), destination = path.resolve(outPackage);
  if (fs.existsSync(destination)) assert.equal(fs.readdirSync(destination).length, 0, 'Use an empty output package');
  const data = {
    schemaVersion: 1, title: 'Другие пути растекания внутри лужи', deviceLabel: 'Radeon Vega · 1024 × 1024',
    qualification: 'Исходный отбор краски сохранён. Меняем только поиск путей внутри неизменной воды; радиус около24 пикселей. Перенос краски, смешивание и остальные этапы остаются нашими. Картинки экспортированы настоящим Mini. За пределами исходной воды пиксели не изменились во всех проверенных повторах.',
    scenes: []
  };
  const passport = { contract: 'native-expansion-comparison-package-v1', selection: 'original-Q-unchanged', radiusPx: 24, artImages: 'Actual native Mini canvas PNG; no CPU alternate compositor and no rescaling', waterImages: 'Diagnostic initial water only: wet RGB202/224/232, dry250/250/250, alpha255; top-left rows', files: [], scenes: [] };
  const generated = []; let renderer;
  const selected = fixtures(); assert.equal(selected.length, 4);
  for (const scene of selected) {
    assert.ok(LABELS[scene.id], 'Known package fixture');
    const timedDir = path.join(evidence, 'selected-cases', scene.id), imagesDir = path.join(evidence, 'selected-images', scene.id);
    const timed = reportFile(path.join(timedDir, 'report.json')), imageReport = reportFile(path.join(imagesDir, 'report.json'));
    validateExpected(timed.data, scene.id); validatePolicy(timed.data);
    assert.equal(timed.data.operationJSONSHA, scene.operationSHA); assert.equal(timed.data.synthetic, scene.synthetic);
    const images = imageReport.data;
    assert.equal(images.contract, 'native-expansion-images-805-v1');
    for (const key of ['pass', 'contextClosed', 'sourceStable']) assert.equal(images[key], true, 'Native images report ' + key);
    assert.equal(images.timingUsed, false); assert.deepEqual(images.errors, []); assert.equal(images.request.fixture, scene.id); assert.equal(images.expectedReportSHA, timed.sha256);
    assert.equal(images.operationJSONSHA, timed.data.operationJSONSHA); assert.equal(images.actualReplayOperationSHA, timed.data.actualReplayOperationSHA);
    assert.deepEqual(images.sourceSHA, timed.data.sourceSHA); assert.equal(images.metadataSHA, timed.data.originalProof.metadataSHA);
    assert.equal(images.renderer, timed.data.bootstrap.renderer); if (renderer === undefined) renderer = images.renderer; else assert.equal(images.renderer, renderer, 'All cards must use the same actual renderer');
    assert.deepEqual(images.contexts.map(row => row.arm), ARMS);
    for (const context of images.contexts) { assert.equal(context.pass, true); assert.equal(context.contextClosed, true); assert.equal(context.sourceStable, true); assert.deepEqual(context.errors, []); assert.deepEqual(context.outputSHA, timed.data.outputs[context.arm].outputSHA); }
    const input = nativeImage(imagesDir, images.images.input); assert.equal(images.images.input.kind, 'input'); assert.deepEqual(images.images.input.sourceSHA, timed.data.sourceSHA);
    const water = readWater(timedDir, timed.data), waterPng = png(waterPixels(water.water), SIZE), waterName = scene.id + '-water.png';
    generated.push({ file: waterName, bytes: waterPng });
    const sceneData = { id: scene.id, label: LABELS[scene.id], input: { src: path.relative(destination, input.file), sha256: input.sha256 }, water: { src: waterName, sha256: hash(waterPng) }, variants: [] };
    const sceneProof = { id: scene.id, synthetic: scene.synthetic, operationJSONSHA: scene.operationSHA, timedReportSHA256: timed.sha256, imagesReportSHA256: imageReport.sha256, inputNativePNG: input.sha256, inputBinarySHA256: water.inputSHA256, waterSHA256: water.waterSHA256, nativeCSHA: {}, imagePNG: {} };
    for (const arm of ARMS) {
      const description = images.images[arm]; assert.equal(description.kind, 'goal'); assert.deepEqual(description.outputSHA, timed.data.outputs[arm].outputSHA); assert.equal(description.nativeCSHA, timed.data.outputs[arm].outputSHA.c);
      const image = nativeImage(imagesDir, description), metrics = deriveMetrics(timed.data, arm);
      assert.equal(metrics.nativeCSHA, description.nativeCSHA); assert.equal(metrics.gpuSamples, timed.data.request.repeats); assert.equal(metrics.wallSamples, timed.data.request.repeats);
      sceneData.variants.push({ id: arm, timingArm: arm, label: VARIANTS[arm].label, note: VARIANTS[arm].note, image: { src: path.relative(destination, image.file), sha256: image.sha256, nativeCSHA: description.nativeCSHA }, report: { file: path.relative(destination, timed.file), sha256: timed.sha256 }, gpuMedianMs: metrics.gpuMedianMs, wallMedianMs: metrics.wallMedianMs });
      sceneProof.nativeCSHA[arm] = description.nativeCSHA; sceneProof.imagePNG[arm] = image.sha256;
    }
    data.scenes.push(sceneData); passport.scenes.push(sceneProof);
  }
  passport.renderer = renderer;
  // Write only after every actual report and native PNG has passed validation.
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const row of generated) { fs.writeFileSync(path.join(destination, row.file), row.bytes, { mode: 0o600 }); passport.files.push({ file: row.file, sha256: hash(row.bytes), bytes: row.bytes.length, kind: 'water-diagnostic-only' }); }
  const dataset = Buffer.from(JSON.stringify(data, null, 2)); fs.writeFileSync(path.join(destination, 'data.json'), dataset, { mode: 0o600 }); passport.files.push({ file: 'data.json', sha256: hash(dataset), bytes: dataset.length });
  const proof = Buffer.from(JSON.stringify(passport, null, 2)); fs.writeFileSync(path.join(destination, 'passport.json'), proof, { mode: 0o600 });
  const summary = { scenes: data.scenes.length, armsPerScene: 3, nativeImagesCopied: 0, generatedWaterPNGs: generated.length, dataSHA256: hash(dataset), passportSHA256: hash(proof) }; console.log(JSON.stringify(summary)); return summary;
}
function selfTest() {
  const { test } = require('node:test');
  test('water diagnostic keeps exact binary wet support and requested colors', () => { const water = Buffer.alloc(PIXELS); water[0] = 1; water[PIXELS - 1] = 255; const pixels = waterPixels(water); assert.deepEqual([...pixels.subarray(0, 4)], [202, 224, 232, 255]); assert.deepEqual([...pixels.subarray(4, 8)], [250, 250, 250, 255]); assert.deepEqual([...pixels.subarray(RGBA - 4)], [202, 224, 232, 255]); assert.deepEqual(pngDimensions(png(pixels, SIZE)), { width: SIZE, height: SIZE }); });
  test('reject all-wet selection and changes outside fixed water', () => { const make = () => ({ request: { contrastSelection: 'original-Q-unchanged', radiusPx: 24 }, warmups: [], samples: [{ arm: 'smooth', sourceUnchanged: true, audit: { dryChangedPixels: 0 }, independentAudit: { dryChangedPixels: 0 }, config: { allWetMobile: false, fixedInitialWater: true, radiusPx: 24 } }] }); validatePolicy(make()); for (const change of [r => r.request.contrastSelection = 'all-wet', r => r.samples[0].config.allWetMobile = true, r => r.samples[0].audit.dryChangedPixels = 1, r => r.samples[0].independentAudit.dryChangedPixels = 1]) { const report = make(); change(report); assert.throws(() => validatePolicy(report)); } });
  test('evidence artifact paths cannot escape their report directory', () => { assert.equal(artifactFile('/owned/evidence', { file: 'original.png' }), '/owned/evidence/original.png'); assert.throws(() => artifactFile('/owned/evidence', { file: '../other.png' })); assert.throws(() => artifactFile('/owned/evidence', { file: '/other.png' })); });
  test('exact four expected fixture labels explicitly mark artificial geometry', () => { const list = fixtures(); assert.equal(list.length, 4); for (const scene of list) { assert.ok(LABELS[scene.id]); assert.equal(LABELS[scene.id].includes('искусственный тест'), scene.synthetic); } });
}
if (require.main === module) { if (process.argv.includes('--self-test')) selfTest(); else try { packageComparison(process.argv[2], process.argv[3]); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { packageComparison, waterPixels, validatePolicy, artifactFile };
