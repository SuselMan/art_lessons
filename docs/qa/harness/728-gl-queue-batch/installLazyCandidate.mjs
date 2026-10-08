/** Own diagnostic engine only, before any stroke. Production adapter/context unchanged. */
export async function installLazyCandidate(engine, enabled, generatedUrl) {
  if (engine._settle || engine._strokeLayerId || engine._wcJoinedDeferred) throw Error('Lazy installation requires fresh idle engine');
  const { CanonicalWatercolorSettlePlan } = await import(generatedUrl);
  const previous = engine._settlePlan;
  if (!previous.ctx) throw Error('Actual production pass/upload context absent');
  const candidate = new CanonicalWatercolorSettlePlan(previous.ctx);
  for (const key of Object.keys(previous)) if (typeof previous[key] === 'boolean') candidate[key] = previous[key];
  candidate.diagnosticLazyCapturedContacts = enabled;
  const counts = { enabled, prepares: 0, captured: 0, fallback: 0, travel: [] };
  const prepare = candidate.prepare;
  candidate.prepare = function (...args) {
    counts.prepares++;
    // Finish metadata is the final argument of the production prepare API.
    const metadata = args[12];
    if (metadata && typeof metadata === 'object' && Array.isArray(metadata.brushTravel)) {
      counts.captured++; counts.travel.push(metadata.brushTravel.length);
    } else counts.fallback++;
    return prepare.apply(this, args);
  };
  previous.destroyTextures();
  engine._settlePlan = candidate;
  engine.__lazyContactDiagnostic = counts;
  return counts;
}
