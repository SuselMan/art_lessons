import fs from 'node:fs'
import { DISPLAY_VERT, WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG } from '../../apps/web/src/engine/src/raster/shaders'
fs.writeFileSync('temp/device-runs/candidate-shaders.json',JSON.stringify({vert:DISPLAY_VERT,frags:{low:WC_FIELD_OP_FRAG,high:WC_FIELD_OP_HIGH_FRAG,carry:WC_FIELD_OP_CARRY_FRAG,colour:WC_FIELD_OP_CARRY_COLOUR_FRAG}}))
