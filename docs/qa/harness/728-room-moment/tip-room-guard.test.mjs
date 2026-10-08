import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assertTipProof,assertTipHistory,assertReviewSettings} from './tip-room-guard.mjs'
test('actual source proof requires both compiled families and distinct hashes',()=>{
 const c={tipEnabled:true,tipProof:{enabled:true,modules:[{family:'stamp',baselineSha:'a',patchedSha:'b'},{family:'ribbon',baselineSha:'c',patchedSha:'d'}]}}
 assert.doesNotThrow(()=>assertTipProof(true,c));assert.throws(()=>assertTipProof(true,{...c,tipProof:{...c.tipProof,modules:c.tipProof.modules.slice(0,1)}}));assert.throws(()=>assertTipProof(false,c))
})
test('OFF proof rejects any specialization',()=>{assert.doesNotThrow(()=>assertTipProof(false,{tipEnabled:false,tipProof:{enabled:false,modules:[]}}));assert.throws(()=>assertTipProof(false,{tipEnabled:false,tipProof:{enabled:false,modules:[{}]}}))})
test('history requires actual target, material removal and exact restoration',()=>{
 const h={undoTarget:{id:'s',type:'stroke'},redoTarget:{id:'s',type:'stroke'},original:{sha:'a',alpha:10},undone:{sha:'b',alpha:0},redone:{sha:'a',alpha:10}}
 assert.doesNotThrow(()=>assertTipHistory(h));assert.throws(()=>assertTipHistory({...h,redoTarget:{id:'other',type:'stroke'}}));assert.throws(()=>assertTipHistory({...h,undone:h.original}));assert.throws(()=>assertTipHistory({...h,redone:{sha:'x',alpha:10}}))
})

test('review checks real UI and actual engine jointly',()=>{const x={ui:{size:400,water:1,pigment:1,nib:'round',pressureResponse:'normal',color:[.2,0,.6]},engine:{size:400,preset:'normal:100:100:PB29:round',color:[.2,0,.6]}};assert.doesNotThrow(()=>assertReviewSettings(x));assert.throws(()=>assertReviewSettings({...x,engine:{...x.engine,size:32}}));assert.throws(()=>assertReviewSettings({...x,ui:{...x.ui,water:.55}}))})
