/** CPU reference for the isolated static-solvent GPU experiment, byte units.
 * V is solvent alpha (physical thickness 4V/255); P is four pigment bytes
 * (physical pigment 2P.b/255). This exchange leaves V unchanged. */
export function concentrationPair(a: readonly number[], b: readonly number[], va: number, vb: number, connected = 1): number[] {
  if (va <= 0 || vb <= 0 || connected <= 0) return [0, 0, 0, 0]
  const ca = a[2] / (2 * va), cb = b[2] / (2 * vb)
  if (ca === cb) return [0, 0, 0, 0]
  const positive = ca > cb, donor = positive ? a : b, receiver = positive ? b : a
  const gate = connected / (1 + 8 * Math.max(ca, cb) ** 2)
  let amount = .09 * gate * Math.min(va, vb) * Math.abs(a[2] / va - b[2] / vb)
  amount = Math.min(amount, donor[2] / 8)
  for (let i = 0; i < 4; i++) amount = Math.min(amount, (255 - receiver[i]) / (8 * Math.max(donor[i] / donor[2], .000001)))
  return donor.map(v => (positive ? 1 : -1) * Math.floor(v * Math.max(amount, 0) / donor[2] + .00001))
}
