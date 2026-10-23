import fs from'node:fs';
let fn=fs.readFileSync('/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/contact-budget/surface-current-perf-function.js','utf8');
fn=fn.replace('e._wcSourceFilmRebase=true;', 'e._wcSourceFilmRebase=true;e._wcAsyncFinish=!!input.async;');
fn=fn.replace('while(e._settle||', 'while(e._wcCanonical.pending||e._settle||');
fn=fn.replace("for(const name of['_onStart'", "for(const name of['_advanceAsyncCanonical','_onStart'");
fn=fn.replace("source:'f877 exact five-source passport'", "source:'7ace index c6ea4399 FIFO8ea5218d; unchanged ordered source generator'");
fs.writeFileSync('temp/surface-fifo/phase-function.js',fn);
