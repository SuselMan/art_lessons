// How the smudge tool's carried imprint settles into the paper's own tooth
// (the follow-up to #416's imprint model — see SMUDGE_TRANSFER_FRAG).
//
// The problem this exists to answer: the imprint is a running average of the
// canvas patches the stump collected as it travelled, and the paper's grain is
// phase-locked to the *paper*, not to the brush — so averaging shifted copies
// of it cancels the grain and keeps only the tone. Depositing that average
// unmodulated is why a smudged area came out as flat tone with the tooth wiped
// off it (measured on the real engine: local contrast 5.99 -> 3.15 at
// unchanged mean tone).
//
// Weighting the transfer by paperCatch, which #416 already does, does not fix
// that: it decides *how much* of a pixel is reworked, so the paper only makes
// the flattening slower in the valleys — the endpoint is still the flat
// average. What re-creates texture is modulating the material actually laid
// down, which is what `bite` below does.
//
// NOT calibrated — the same status every other tuning constant in this engine
// starts with, and the reason both knobs are live in the debug overlay.
export interface SmudgeGrainConfig {
  /** How strongly the deposit follows the paper's tooth at zero pressure,
   *  0..1. 0 lays the imprint down flat — exactly the pre-existing behaviour,
   *  which is what makes this knob an A/B rather than a one-way change. At 1
   *  a ridge receives twice what the flat deposit would and a valley floor
   *  receives nothing, so the tooth is re-imprinted at full contrast.
   *
   *  Centred on 0.5, which is the catch channel's own mean by construction —
   *  bakePaperTextures' catchAt biases the paper's signed slope by exactly
   *  +0.5 — so this redistributes the deposit across the grain rather than
   *  changing how much of it lands in total. */
  bite: number
  /** How much of `bite` full pressure takes away, 0..1: pressing the stump
   *  harder drives the graphite deeper into the valleys until it fills them
   *  and the mark flattens out. 0 makes pressure irrelevant to the grain; 1
   *  means a fully pressed stump deposits perfectly flat.
   *
   *  Pressure is currently the *only* lever on depth. Repeated passes were
   *  expected to deepen the tooth on their own — each pass picks the
   *  already-modulated field back up and re-modulates it — and measurably
   *  they do not: at bite 0.6 the smudged area holds local contrast 5.43
   *  after two passes and 5.33 after ten. The imprint's own averaging strips
   *  the tooth back out as fast as the deposit puts it in, so the stroke
   *  reaches that equilibrium at once and stays there. Making repetition
   *  bite deeper needs the *pickup* side weighted by the paper too (take
   *  more off the ridges, leave the valleys loaded), which
   *  SMUDGE_PICKUP_FRAG cannot do today — it samples no paper at all. */
  press: number
}

// `bite` is not picked by eye: it is the measured point where a smudge stroke
// stops changing the mean tone of a field it works entirely inside.
//
// Why there is such a point at all. The transfer weights how much of a pixel
// it reworks by the paper's catch, and the graphite already on the page was
// laid down by DAB_FRAG through that same catch — so a dab takes the most
// from exactly the pixels holding the most graphite (the ridges) and hands
// them back the patch average. That positive covariance is a net loss of tone
// on every dab, which is why a dense area visibly lightened under the tool
// with no grain term at all. Depositing back along the same tooth cancels it,
// and the balance sits at half the slope with which the existing graphite
// follows the grain.
//
// Measured over ten passes inside a dense 8B field, mean luminance of the
// interior: bite 0 drifts 187.19 -> 190.44 and keeps climbing, 0.30 -> 188.56,
// 0.45 -> 187.48 and flat from the third pass on, 0.60 -> 186.27 (over-
// corrected, drifting dark). Hence 0.45.
//
// That balance is a property of *this* paper and grade, not a universal
// constant — bakePaperTextures gives coarse/medium/fine catchGains of 2.07,
// 1.50 and 1.17, so the grain's own amplitude (and with it the neutral point)
// moves with the paper. Deriving it instead of pinning it is the open
// question these knobs exist to answer.
export const SMUDGE_GRAIN: SmudgeGrainConfig = {
  bite: 0.45,
  press: 0.5,
}

/** Slider descriptors for the debug overlay — lives next to the config it
 *  drives, same as PENCIL_TILT_SLIDERS/CHARCOAL_FEEL_SLIDERS. */
export const SMUDGE_GRAIN_SLIDERS: readonly {
  key: keyof SmudgeGrainConfig; label: string; min: number; max: number; step: number
}[] = [
  { key: 'bite',  label: 'grain bite',  min: 0, max: 1, step: 0.01 },
  { key: 'press', label: 'press flat',  min: 0, max: 1, step: 0.01 },
]

/** The tooth-following amplitude a dab at this pressure deposits with — the
 *  one place the two knobs combine, so the shader uniform and any future
 *  non-GPU consumer (a test, the mock) cannot drift apart on the formula. */
export function smudgeGrainRelief(pressure: number, cfg: SmudgeGrainConfig = SMUDGE_GRAIN): number {
  return Math.max(0, Math.min(1, cfg.bite * (1 - cfg.press * pressure)))
}
