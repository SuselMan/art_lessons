import{test}from'node:test';import assert from'node:assert/strict';import{compareColourSnapshot}from'./run.mjs';
const fixture=()=>({fields:{records:[{key:'P',role:'P',width:1,height:1,channels:4,byteLength:4,nonzero:[1,1,1,1],max:[1,1,1,1],sum:[1,1,1,1],sha256:'rgba'}],coverage:{nonemptyRequiredRoles:true}},materialWholeLayer:[{rgbaSha256:'whole'}],rgbaSha256:'export',tapeSha256:'same',colourSnapshot:{skipped:1},glError:0,lost:false});
test('actual exercised single field/whole/tape equality is valid',()=>assert.equal(compareColourSnapshot(fixture(),fixture(),'single400').valid,true));
test('empty capture cannot prove parity',()=>{const a=fixture();a.fields.coverage.nonemptyRequiredRoles=false;assert.equal(compareColourSnapshot(a,a,'single400').valid,false)});
test('mixed negative control must retain snapshot',()=>assert.equal(compareColourSnapshot(fixture(),fixture(),'mixed400').valid,false));
test('one field byte hash delta blocks whole promotion',()=>{const a=fixture(),b=fixture();b.fields.records[0].sha256='different';assert.equal(compareColourSnapshot(a,b,'single400').valid,false)});
