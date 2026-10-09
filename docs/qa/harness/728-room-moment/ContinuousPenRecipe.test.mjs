import test from'node:test';import assert from'node:assert/strict';
import{continuous400Points,continuousPenSamples,validateContinuous400Bounds}from'./ContinuousPenRecipe.mjs';
test('two ordered coalesced samples per frame, fixed time per leg',()=>{assert.deepEqual(continuousPenSamples(continuous400Points,300,20),[{elapsedMs:290,worldX:590,worldY:300},{elapsedMs:300,worldX:600,worldY:300}]);assert.deepEqual(continuousPenSamples(continuous400Points,1800,20).at(-1),{elapsedMs:1800,worldX:600,worldY:500})});
test('400 brush fits world page and refuses boundary violation',()=>{assert.equal(validateContinuous400Bounds(),true);assert.throws(()=>validateContinuous400Bounds([[100,100]]));assert.throws(()=>continuousPenSamples(continuous400Points,300,20,{perFrame:1}))});
