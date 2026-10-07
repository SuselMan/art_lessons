/** Literal WC_NOISE_GLSL helpers; same offline 251x251 lattice. */
export const CANONICAL_NOISE_WGSL = `
  fn wcLattice(p:vec2f)->f32 {
    return textureLoad(noiseTex,vec2i(p-floor(p/251.0)*251.0),0).r;
  }
  fn hash(p:vec2f)->f32 {
    return wcLattice(floor(p * 4.0));
  }
  fn wcNoise(p:vec2f)->f32 {
    var i:vec2f = floor(p);
    var f:vec2f = fract(p);
    var u:vec2f = f * f * (3.0 - 2.0 * f);
    var a:f32 = wcLattice(i);
    var b:f32 = wcLattice(i + vec2f(1.0, 0.0));
    var c:f32 = wcLattice(i + vec2f(0.0, 1.0));
    var d:f32 = wcLattice(i + vec2f(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  fn wcFbm(p:vec2f)->f32 {
    return 0.63 * wcNoise(p) + 0.37 * wcNoise(p * 2.7 + vec2f(31.4, 17.9));
  }
  fn wcPoolness(puddle:f32, paperWet:f32, on:f32)->f32 {
    return on * smoothstep(0.5, 0.95, puddle) * (1.0 - clamp(paperWet, 0.0, 1.0));
  }
  fn wcPoolBlot(wp:vec2f, seed:vec2f, puddle:f32, paperWet:f32, on:f32)->f32 {
    var pool:f32 = on * clamp(puddle, 0.0, 1.0);
    if (pool <= 0.0) { return 1.0; }
    var n:f32 = wcFbm(wp * 0.03 + seed * 1.7 + vec2f(13.0, 5.0));
    return mix(1.0, 0.4 + 1.2 * smoothstep(0.3, 0.7, n), pool);
  }
fn wcFilmBlot(wp:vec2f, seed:vec2f, puddle:f32, paperWet:f32, on:f32, brushWater:f32, pigmentOn:f32)->f32 {
    if (pigmentOn < 0.5) { return wcPoolBlot(wp, seed, puddle, paperWet, on); }
    var pool:f32 = on * clamp(max(puddle, 0.0 * clamp(brushWater, 0.0, 1.0) * (1.0 - clamp(paperWet, 0.0, 1.0))), 0.0, 1.0);
    if (pool <= 0.0) { return 1.0; }
    var n:f32 = wcFbm(wp * 0.055 + seed * 1.7 + vec2f(13.0, 5.0));
    return 1.0 + pool * 0.85 * (2.0 * smoothstep(0.3, 0.7, n) - 1.0);
}
  fn wcCloud(wp:vec2f, seed:vec2f, amount:f32)->f32 {
    if (amount <= 0.0) { return 1.0; }
    return 1.0 + amount * (wcFbm(wp * 0.018 + seed) - 0.5) * 2.0;
  }
  fn wcSettling(wp:vec2f, seed:vec2f, amount:f32)->f32 {
    if (amount <= 0.0) { return 1.0; }
    var n:f32 = wcFbm(wp * 0.11 + seed + vec2f(19.0, 71.0)) - 0.5;
    n = select(n * 1.6,n * 0.5,n < 0.05);
    return max(1.0 + amount * n * 2.0, 0.0);
  }
  const WC_STANDING_LO:f32 = 0.04;
  const WC_STANDING_HI:f32 = 0.35;
  fn wcStandingGate(brushWater:f32, washWater:f32)->f32 {
    return smoothstep(WC_STANDING_LO, WC_STANDING_HI, brushWater / max(washWater, 1e-4));
  }
  const WC_HAIR_WET_LO:f32 = 0.25;
  const WC_HAIR_WET_HI:f32 = 0.75;
  fn wcHairAmp(bristleInk:f32, brushWater:f32)->f32 {
    return min(1.0, bristleInk * 1.6) * (1.0 - smoothstep(WC_HAIR_WET_LO, WC_HAIR_WET_HI, brushWater));
  }
  fn wcHairComb(hair:f32, amp:f32)->f32 {
    return mix(1.0, 2.0 * smoothstep(0.3, 0.7, hair), amp);
  }
  const WC_HAIR_DRIFT_SCALE:f32 = 0.0012;
  const WC_HAIR_DRIFT_GAIN:f32 = 0.9;
  fn wcHairField(across:f32, combs:f32, wp:vec2f)->f32 {
    var drift:f32 = wcFbm(wp * WC_HAIR_DRIFT_SCALE + vec2f(71.0, 13.0));
    return wcFbm(vec2f(across * combs, drift * WC_HAIR_DRIFT_GAIN) + vec2f(3.0, 29.0));
  }
  fn wcTipPressure(pressure:f32, radius:f32)->f32 {
    if (pressure <= 0.0) { return 0.0; }
    return max(pressure, 0.06 * (1.0 - smoothstep(1.0, 2.0, radius)));
  }
  fn wcTipContact(across:f32, combs:f32, wp:vec2f, pressure:f32)->f32 {
    if (combs <= 0.0) { return 1.0; }
    var hair:f32 = wcHairField(across, combs, wp);
    var light:f32 = 1.0 - smoothstep(0.12, 0.70, pressure);
    var release:f32 = 1.0 - smoothstep(0.012, 0.060, pressure);
    var threshold:f32 = mix(mix(0.34, 0.39, light), 0.62, release);
    var opening:f32 = smoothstep(0.55, 0.72, wcNoise(wp * 0.009 + vec2f(37.0, 91.0)));
    var contact:f32 = mix(1.0, smoothstep(threshold - 0.02, threshold + 0.02, hair), max(opening, release));
    return contact * smoothstep(0.0, 0.012, pressure);
  }
`;
