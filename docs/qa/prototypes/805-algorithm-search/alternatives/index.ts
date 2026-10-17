import {definitions as stable} from './stable-fluids'
import {definitions as lattice} from './lattice-diffusion'
import {definitions as artistic,programDefinitions} from './artistic-front'
import {definitions as wetBoundary} from './wet-boundary-detail'
export const definitions=[...stable,...lattice,...artistic,...programDefinitions,...wetBoundary]
