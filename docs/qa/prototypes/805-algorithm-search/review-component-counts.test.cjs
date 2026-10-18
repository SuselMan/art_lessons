'use strict';const{test}=require('node:test'),assert=require('node:assert/strict'),{count}=require('./review-component-counts.cjs');
test('four-connected diagonal split and only wet pigment counts',()=>{const r=new Uint8Array(16);r[3]=100;r[7]=100;assert.deepEqual(count(r,Uint8Array.of(1,0,0,1),2),{components:2,pigmented:1})});
test('water-only zero goals; dry-only carrier zero goals',()=>{const r=new Uint8Array(16);assert.deepEqual(count(r,new Uint8Array(4).fill(1),2),{components:1,pigmented:0});r[3]=255;assert.deepEqual(count(r,new Uint8Array(4),2),{components:0,pigmented:0})});
