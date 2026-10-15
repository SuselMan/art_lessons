import {install as floatFilm} from '/@fs/home/suselman/projects/pencil-agents/728-watercolor-room-integration/docs/qa/runs/728-specialized-nib-2026-10-15/bounded-float-source-film-adapter.js';
import {install as lazyMerge} from '/@fs/home/suselman/projects/pencil-agents/728-watercolor-room-integration/docs/qa/runs/728-specialized-nib-2026-10-15/lazy-source-merge-adapter.js';
export async function install(e){const f=await floatFilm(e),l=await lazyMerge(e);return{stats:()=>({float:f.stats(),lazy:l.stats()}),dispose(){l.dispose();f.dispose()}}}
