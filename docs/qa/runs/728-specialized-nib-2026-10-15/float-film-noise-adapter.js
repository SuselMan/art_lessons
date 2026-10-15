import {install as film} from '/@fs/home/suselman/projects/pencil-agents/728-watercolor-room-integration/docs/qa/runs/728-specialized-nib-2026-10-15/float-lazy-source-adapter.js';
import {install as noise} from '/@fs/home/suselman/projects/pencil-agents/728-watercolor-room-integration/docs/qa/runs/728-specialized-nib-2026-10-15/nib-base-noise-cache-adapter.js';
export async function install(e){const f=await film(e),n=noise(e);return{stats:()=>({film:f.stats(),noise:n.stats()}),dispose(){n.dispose();f.dispose()}}}
