// Kubelka–Munk absorption (K) and scattering (S) per RGB channel.
// Values from Curtis et al. 1997, fig. 5 (the paper's hand-tuned table).
// gran — how strongly the pigment settles into the valleys of the grain,
// dens — how fast it settles, stain — how hard it is to lift once down
// (Curtis's γ, ρ, ω). These three are ours, set by eye against the photos.
export const PIGMENTS = [
  { id: 'ultramarine', name: 'Ультрамарин', K: [0.9, 0.6, 0.07], S: [0.005, 0.005, 0.09], gran: 0.6, dens: 1.2, stain: 1.0, swatch: '#2e3f9e' },
  { id: 'rose', name: 'Хинакридон розовый', K: [0.22, 1.47, 0.57], S: [0.05, 0.003, 0.03], gran: 0.05, dens: 0.6, stain: 4.0, swatch: '#c43a6e' },
  { id: 'hansa', name: 'Ганза жёлтая', K: [0.06, 0.21, 1.78], S: [0.5, 0.88, 0.009], gran: 0.1, dens: 0.8, stain: 2.0, swatch: '#f1c232' },
  { id: 'indianred', name: 'Индийская красная', K: [0.46, 1.07, 1.5], S: [1.28, 0.38, 0.21], gran: 0.5, dens: 1.8, stain: 1.2, swatch: '#8e3b2e' },
]
