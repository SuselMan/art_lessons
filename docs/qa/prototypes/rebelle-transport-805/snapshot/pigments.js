// Kubelka–Munk absorption (K) and scattering (S) per RGB channel.
// The first set is from Curtis et al. 1997, fig. 5 (their hand-tuned table);
// ultramarine is nudged towards cyan (the paper's reads violet next to the
// photos), violet and phthalo are ours, eyeballed against the photos.
// gran — how strongly the pigment settles into the valleys of the grain,
// dens — how fast it settles, stain — how hard it is to lift once down
// (Curtis's γ, ρ, ω). These three are ours, set by eye.
export const LIBRARY = {
  ultramarine: { name: 'Ультрамарин', K: [0.9, 0.6, 0.07], S: [0.005, 0.005, 0.09], gran: 0.6, dens: 1.2, stain: 1.0, swatch: '#3552b0' },
  rose: { name: 'Хинакридон розовый', K: [0.22, 1.47, 0.57], S: [0.05, 0.003, 0.03], gran: 0.05, dens: 0.6, stain: 4.0, swatch: '#c43a6e' },
  hansa: { name: 'Ганза жёлтая', K: [0.06, 0.21, 1.78], S: [0.5, 0.88, 0.009], gran: 0.1, dens: 0.8, stain: 2.0, swatch: '#f1c232' },
  indianred: { name: 'Индийская красная', K: [0.46, 1.07, 1.5], S: [1.28, 0.38, 0.21], gran: 0.5, dens: 1.8, stain: 1.2, swatch: '#8e3b2e' },
  violet: { name: 'Диоксазин фиолетовый', K: [0.55, 1.1, 0.3], S: [0.02, 0.01, 0.04], gran: 0.15, dens: 0.8, stain: 3.0, swatch: '#6a3fa0' },
  phthalo: { name: 'Фталоцианин синий', K: [1.6, 0.45, 0.2], S: [0.01, 0.03, 0.05], gran: 0.02, dens: 0.5, stain: 5.0, swatch: '#1d5e8c' },
  umber: { name: 'Умбра жжёная', K: [0.74, 1.54, 2.1], S: [0.09, 0.09, 0.004], gran: 0.4, dens: 1.5, stain: 1.5, swatch: '#5b3a22' },
}

// The simulation carries four pigment slots (one RGBA texture). Which four is
// chosen per page: ?slots=violet,hansa,phthalo,rose
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
const ids = (q.get('slots') || 'ultramarine,rose,hansa,indianred').split(',').filter((id) => LIBRARY[id]).slice(0, 4)
while (ids.length < 4) ids.push('umber')
export const PIGMENTS = ids.map((id) => ({ id, ...LIBRARY[id] }))
