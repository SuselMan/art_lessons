/** Only generated control IDs are ignored. Original tape IDs and actual targets stay exact. */
export function compareRuns(baseline, measured) {
  const normalize = report => {
    const controls = report.operations.filter(op => op.type === 'operation_undo' || op.type === 'operation_redo');
    if (controls.length !== 2 || controls[0].type !== 'operation_undo' || controls[1].type !== 'operation_redo') return null;
    if (!report.undo?.id || !report.redo?.id || !report.undo.meaningful || !report.redo.exact) return null;
    const originals = report.operations.filter(op => op.type !== 'operation_undo' && op.type !== 'operation_redo');
    if (!originals.some(op => op.id === report.undo.id) || !originals.some(op => op.id === report.redo.id)) return null;
    return report.operations.map(op => {
      if (op.type !== 'operation_undo' && op.type !== 'operation_redo') return op;
      const target = op.type === 'operation_undo' ? report.undo.id : report.redo.id;
      if (op.targetOpId !== undefined && op.targetOpId !== target) return { invalidTarget: true, ...op };
      return { ...op, id: '<generated-control>', targetOpId: target };
    });
  };
  const keys = ['tapeSha256','code','materialWholeLayer','rgbaSha256','exportSize','undo','redo'];
  const parity = Object.fromEntries(keys.map(k => [k, JSON.stringify(baseline[k]) === JSON.stringify(measured[k])]));
  const left = normalize(baseline), right = normalize(measured);
  parity.operations = left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right);
  return { parity, valid: Object.values(parity).every(Boolean) && !baseline.lost && !measured.lost && baseline.glError === 0 && measured.glError === 0 };
}
export function gpuSummary(rows) {
  return Object.fromEntries([...new Set(rows.map(row => row.method))].map(method => {
    const values = rows.filter(r => r.method === method && !r.invalid && Number.isFinite(r.gpuMs)).map(r => r.gpuMs).sort((a,b) => a-b);
    const quantile = p => values.length ? values[Math.ceil(p * values.length) - 1] : null;
    return [method, { validSampleCount: values.length, invalidSampleCount: rows.filter(r => r.method === method && r.invalid).length, medianMs: quantile(.5), p90Ms: quantile(.9), maxMs: values.at(-1) ?? null }];
  }));
}
