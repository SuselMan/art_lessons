'use strict';
// QA source transform only: no installer, no GL calls, no changes to the old Mini build.
const ID='805-native-front-lazy-v1';
const CLIMB=`    float climb = u_climb * (1.0 + WC_FRONT_FEATHER * smoothstep(WC_FRONT_FEATHER_LO, WC_FRONT_FEATHER_HI,
      wcFbm((px + u_paperOrigin) * WC_FRONT_FEATHER_SCALE + vec2(41.0, 7.0))));`;
const FILM='      float film = smoothstep(WC_FILM_LO, WC_FILM_HI, max(texture2D(u_film, v_uv).a, u_foreignWet * texture2D(u_foreignFilm, v_uv).r));';
const ELIGIBLE='      if (ci >= 0.999) continue;';
const MARKER='    bool wcFrontLazyReady = false;';
function once(source,anchor,label){if(source.split(anchor).length!==2)throw Error(ID+': nonunique/changed '+label+' anchor');}
function transformFrontLazyShader(source){
 if(typeof source!=='string')throw TypeError('Shader source must be string');
 if(source.includes('wcFrontLazyReady'))throw Error(ID+': already transformed');
 for(const [anchor,label]of [[CLIMB,'climb'],[FILM,'film'],[ELIGIBLE,'eligible'],['    float hj = wcFrontHeightAt(px);','height'],['      float edge = len * relief * mix(u_dryCost, 1.0, film);','edge'],['    gl_FragColor = vec4(min(best, u_costMax) / u_costMax, hj, texture2D(u_cost, v_uv).b, 1.0);\n  }\n','final output']])once(source,anchor,label);
 // Assignment RHS is copied verbatim from the original declaration. No hash, sample,
 // arithmetic, neighbour order, cost threshold, or final channel expression changes.
 const assignments=CLIMB.replace('    float climb =','        climb =')+'\n'+FILM.replace('      float film =','        film =');
 return source.replace(CLIMB,'    float climb = 0.0;\n    float film = 0.0;\n'+MARKER)
  .replace(FILM+'\n','')
  .replace(ELIGIBLE,ELIGIBLE+'\n      if (!wcFrontLazyReady) {\n'+assignments+'\n        wcFrontLazyReady = true;\n      }');
}
function transformFrontLazyModule(source){
 if(typeof source!=='string')throw TypeError('Module source must be string');
 const open='export const WC_WATER_FRONT_FRAG = `';once(source,open,'module declaration');
 const start=source.indexOf(open)+open.length,end=source.indexOf('`;',start);if(end<start)throw Error(ID+': missing module terminator');
 const body=source.slice(start,end);return source.slice(0,start)+transformFrontLazyShader(body)+source.slice(end);
}
module.exports={ID,CLIMB,FILM,ELIGIBLE,MARKER,transformFrontLazyShader,transformFrontLazyModule};
