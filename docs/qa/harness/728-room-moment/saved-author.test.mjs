import test from 'node:test'
import assert from 'node:assert/strict'
import {compareSavedAuthor} from './saved-author.mjs'
test('saved meaningful baseline exact and changed hashes rejected',()=>{const author={fields:{gatePassed:true,records:[{role:'material',sha:'a'}]},export:{alpha:1,sha:'x'},chunks:[{ordinal:0,recipe:{x256:1}}]},saved={author,strokeObservations:[{live:{meaningfulPigmentVisible:true}}]};assert.equal(compareSavedAuthor(saved,author).exact,true);const changed=structuredClone(author);changed.fields.records[0].sha='b';assert.equal(compareSavedAuthor(saved,changed).exact,false);assert.throws(()=>compareSavedAuthor({author},author))})
