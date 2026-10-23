import fs from 'node:fs'
import { DISPLAY_VERT, WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG } from './baseline-shaders'
fs.writeFileSync('temp/device-runs/baseline-shaders.json',JSON.stringify({vert:DISPLAY_VERT,frags:{low:WC_FIELD_OP_FRAG,high:WC_FIELD_OP_HIGH_FRAG}}))
