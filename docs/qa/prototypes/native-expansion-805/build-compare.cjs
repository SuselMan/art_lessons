'use strict';
/** Build a small, self-contained comparison only from successful measured reports. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const HASH = /^[a-f0-9]{64}$/;
const ARMS = ['original', 'smooth', 'noisy'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
function checkedText(value, field, maximum = 240) {
  assert.ok(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum, field);
  return value;
}
function pngDimensions(bytes) {
  assert.ok(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  assert.equal(bytes.readUInt32BE(8), 13, 'PNG IHDR size');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.ok(width > 0 && height > 0 && width <= 4096 && height <= 4096, 'PNG dimensions');
  return { width, height };
}
function deriveMetrics(report, arm) {
  assert.ok(ARMS.includes(arm), 'Known timingArm required');
  for (const key of ['pass', 'contextClosed', 'sourceStable']) assert.equal(report[key], true, 'Report ' + key);
  if (report.errors !== undefined) assert.deepEqual(report.errors, [], 'Report errors');
  assert.ok(Array.isArray(report.samples), 'Measured samples required');
  const rows = report.samples.filter(row => row.arm === arm && row.phase !== 'warmup');
  assert.ok(rows.length > 0, 'No measured samples for ' + arm);
  for (const row of rows) assert.ok(row.phase === undefined || row.phase === 'measured', 'Unknown sample phase');
  const metric = (key, value) => {
    const present = rows.filter(row => value(row) !== undefined && value(row) !== null);
    if (!present.length) return { median: null, count: 0 };
    assert.equal(present.length, rows.length, 'Partially missing ' + key + ' samples');
    const values = rows.map(row => value(row));
    for (const time of values) assert.ok(Number.isFinite(time) && time > 0, 'Invalid ' + key + ' time');
    return { median: median(values), count: values.length };
  };
  for (const row of rows) {
    if (row.gpu !== undefined && row.gpu !== null) {
      assert.equal(row.gpu.disjoint, false, 'Disjoint GPU sample');
      if (row.gpu.mode !== undefined) assert.equal(row.gpu.mode, 'whole', 'Comparison uses whole GPU queries only');
    }
    if (row.outputSHA !== undefined) {
      assert.deepEqual(Object.keys(row.outputSHA).sort(), ['c', 'coverage', 'p']);
      for (const digest of Object.values(row.outputSHA)) assert.match(digest, HASH);
    }
  }
  const gpu = metric('GPU', row => row.gpu?.totalGpuMs), wall = metric('wall', row => row.hostSample?.totalToFullCMs);
  const outputs = rows.map(row => row.outputSHA);
  if (outputs.some(Boolean)) {
    assert.ok(outputs.every(Boolean), 'Incomplete output hashes');
    for (const output of outputs) assert.deepEqual(output, outputs[0], 'Repeated output differs');
  }
  return { gpuMedianMs: gpu.median, wallMedianMs: wall.median, gpuSamples: gpu.count, wallSamples: wall.count, nativeCSHA: outputs[0]?.c || null };
}
function declaredMetric(value, actual, name) {
  if (value === undefined) return;
  if (actual === null) assert.equal(value, null, name + ' was not measured');
  else assert.ok(Number.isFinite(value) && Math.abs(value - actual) <= 1e-6, name + ' differs from report median');
}
function build(inputFile, outputFile, options = {}) {
  const external = new Map();
  assert.ok(inputFile && outputFile, 'Usage: node build-compare.cjs data.json output.html');
  const base = path.dirname(path.resolve(inputFile)), source = JSON.parse(fs.readFileSync(inputFile)), reports = new Map();
  assert.equal(source.schemaVersion, 1);
  assert.ok(Array.isArray(source.scenes) && source.scenes.length >= 2 && source.scenes.length <= 4, 'Use 2–4 scenes');
  const data = { schemaVersion: 1, title: checkedText(source.title || 'Растекание внутри лужи', 'title'), deviceLabel: checkedText(source.deviceLabel, 'deviceLabel'), qualification: source.qualification ? checkedText(source.qualification, 'qualification', 1000) : '', scenes: [] };
  const image = value => {
    assert.ok(value && typeof value.src === 'string' && !/^https?:|^data:/.test(value.src), 'Local PNG path required');
    assert.match(value.sha256, HASH);
    const bytes = fs.readFileSync(path.resolve(base, value.src));
    assert.equal(hash(bytes), value.sha256, 'PNG SHA mismatch');
    const src=options.externalImages?'expansion-images/'+value.sha256+'.png':'data:image/png;base64,'+bytes.toString('base64');
    if(options.externalImages)external.set(value.sha256,{from:path.resolve(base,value.src),bytes});
    return {src,sha256:value.sha256,...pngDimensions(bytes)};
  };
  const readReport = value => {
    assert.ok(value && typeof value.file === 'string', 'Report file required');
    assert.match(value.sha256, HASH);
    const file = path.resolve(base, value.file);
    if (!reports.has(file)) { const bytes = fs.readFileSync(file); reports.set(file, { sha256: hash(bytes), report: JSON.parse(bytes) }); }
    const result = reports.get(file);
    assert.equal(result.sha256, value.sha256, 'Report SHA mismatch');
    return result;
  };
  const sceneIds = new Set();
  for (const item of source.scenes) {
    assert.match(item.id, /^[a-z0-9][a-z0-9-]{0,79}$/);
    assert.ok(!sceneIds.has(item.id), 'Duplicate scene'); sceneIds.add(item.id);
    assert.ok(Array.isArray(item.variants) && item.variants.length >= 2 && item.variants.length <= 3, 'Original plus1–2 candidates');
    const current = { id: item.id, label: checkedText(item.label, 'scene label'), input: image(item.input), variants: [] }, variantIds = new Set();
    if (item.water) {
      current.water = image(item.water);
      assert.deepEqual([current.water.width, current.water.height], [current.input.width, current.input.height], 'Water image dimensions differ');
    }
    for (const variant of item.variants.filter(v=>v.id!=='noisy')) {
      assert.ok(ARMS.includes(variant.id), 'Known variant id required');
      assert.ok(!variantIds.has(variant.id), 'Duplicate variant'); variantIds.add(variant.id);
      assert.equal(variant.timingArm, variant.id, 'timingArm must identify selected variant');
      const evidence = readReport(variant.report), metrics = deriveMetrics(evidence.report, variant.timingArm);
      declaredMetric(variant.gpuMedianMs, metrics.gpuMedianMs, 'GPU median'); declaredMetric(variant.wallMedianMs, metrics.wallMedianMs, 'Wall median');
      const picture = image(variant.image);
      assert.deepEqual([picture.width, picture.height], [current.input.width, current.input.height], 'Image dimensions differ');
      if (variant.image.nativeCSHA !== undefined) assert.equal(variant.image.nativeCSHA, metrics.nativeCSHA, 'Rendered C source differs from report');
      current.variants.push({ id: variant.id, label: checkedText(variant.label, 'variant label'), image: picture, gpuMedianMs: metrics.gpuMedianMs, wallMedianMs: metrics.wallMedianMs, gpuSamples: metrics.gpuSamples, wallSamples: metrics.wallSamples, reportSHA256: evidence.sha256, note: variant.note ? checkedText(variant.note, 'variant note', 600) : '' });
    }
    assert.ok(variantIds.has('original'), 'Original target required for hold comparison');
    data.scenes.push(current);
  }
  const template = fs.readFileSync(path.join(__dirname, 'compare.html'), 'utf8'), marker = '<script id="comparison-data" type="application/json">{"schemaVersion":1,"scenes":[]}</script>';
  assert.equal(template.split(marker).length, 2, 'Exactly one data marker required');
  const encoded = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = template.replace(marker, '<script id="comparison-data" type="application/json">' + encoded + '</script>');
  fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true, mode: 0o700 });
  if(options.externalImages){const dir=path.join(path.dirname(path.resolve(outputFile)),'expansion-images');fs.mkdirSync(dir,{recursive:true,mode:0o700});for(const [sha,row]of external){const dest=path.join(dir,sha+'.png');if(fs.existsSync(dest))assert.equal(hash(fs.readFileSync(dest)),sha,'Output PNG collision');else fs.linkSync(row.from,dest)}}
  const pending = outputFile + '.pending'; fs.writeFileSync(pending, html, { mode: 0o600 }); fs.renameSync(pending, outputFile);
  const result = { scenes: data.scenes.length, variants: data.scenes.map(scene => ({ id: scene.id, count: scene.variants.length })), reportCount: reports.size, bytes: Buffer.byteLength(html), sha256: hash(html) };
  console.log(JSON.stringify(result)); return result;
}
function selfTest() {
  const { test } = require('node:test');
  const makeReport = () => ({ pass: true, contextClosed: true, sourceStable: true, errors: [], samples: ['original', 'smooth', 'noisy'].flatMap(arm => [3, 1, 2].map(ms => ({ arm, gpu: { mode: 'whole', disjoint: false, totalGpuMs: ms }, hostSample: { totalToFullCMs: ms + 2 }, outputSHA: { p: 'a'.repeat(64), c: 'b'.repeat(64), coverage: 'c'.repeat(64) } }))) });
  test('derive per-arm medians and exclude only explicit warmup', () => {
    const report = makeReport(); report.samples.push({ arm: 'smooth', phase: 'warmup', gpu: { totalGpuMs: -1 } });
    assert.deepEqual(deriveMetrics(report, 'smooth'), { gpuMedianMs: 2, wallMedianMs: 4, gpuSamples: 3, wallSamples: 3, nativeCSHA: 'b'.repeat(64) });
  });
  test('reject failed reports, disjoint, partial metrics and changing outputs', () => {
    for (const change of [r => r.pass = false, r => r.contextClosed = false, r => r.sourceStable = false, r => r.samples[0].gpu.disjoint = true, r => r.samples[0].gpu.mode = 'groups', r => r.samples[0].gpu.totalGpuMs = 0, r => r.samples[0].gpu.totalGpuMs = NaN, r => delete r.samples[0].gpu, r => r.samples[0].outputSHA.c = 'd'.repeat(64)]) { const report = makeReport(); change(report); assert.throws(() => deriveMetrics(report, 'original')); }
  });
  test('entirely unmeasured metric is null, never zero', () => { const report = makeReport(); for (const row of report.samples) delete row.gpu; const metrics = deriveMetrics(report, 'noisy'); assert.equal(metrics.gpuMedianMs, null); assert.equal(metrics.gpuSamples, 0); assert.equal(metrics.wallMedianMs, 4); });
  test('numbers supplied in data must match actual medians', () => { declaredMetric(2, 2, 'GPU'); declaredMetric(undefined, 2, 'GPU'); declaredMetric(null, null, 'GPU'); assert.throws(() => declaredMetric(1, 2, 'GPU')); assert.throws(() => declaredMetric(0, null, 'GPU')); });
  test('PNG dimensions and type checked without decoding or generating an image', () => { const bytes = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes); bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(1024, 16); bytes.writeUInt32BE(1024, 20); assert.deepEqual(pngDimensions(bytes), { width: 1024, height: 1024 }); bytes.writeUInt32BE(0, 16); assert.throws(() => pngDimensions(bytes)); assert.throws(() => pngDimensions(Buffer.from('not an image'))); });
}
if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else try { build(process.argv[2], process.argv[3], {externalImages:process.env.QA_EXTERNAL_IMAGES==='1'}); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { build, deriveMetrics, declaredMetric, pngDimensions, median };
