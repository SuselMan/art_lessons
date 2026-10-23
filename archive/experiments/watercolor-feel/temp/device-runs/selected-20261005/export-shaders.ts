import fs from 'node:fs'
import * as m from '../../../apps/web/src/engine/src/raster/shaders'
const names=[['DAB_VERT','DAB_FRAG'],['DAB_VERT_INSTANCED','DAB_FRAG'],['RIBBON_VERT','RIBBON_FRAG'],...['WC_FIELD_OP_FRAG','WC_FIELD_OP_HIGH_FRAG','WC_FIELD_OP_CARRY_FRAG','WC_FIELD_OP_CARRY_COLOUR_FRAG','WC_DIFFUSE_FRAG','WC_BRUSH_DRAG_FRAG'].map(f=>['DISPLAY_VERT',f])]
fs.writeFileSync('temp/device-runs/selected-20261005/current-shader-pairs.json',JSON.stringify(names.map(names=>({names,source:names.map(name=>m[name as keyof typeof m])}))))
