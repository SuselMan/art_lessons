'use strict';
const loader=require('./owned-loader.cjs'),pc=require('./pc-loader.cjs');
loader.openOwned=pc.openOwned;
require('./native-mini-direct-run.cjs').main().catch(e=>{console.error(e.message);process.exitCode=1});
