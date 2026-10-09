import test from 'node:test'
import assert from 'node:assert/strict'
import {cpuProfileHtml} from './graph.mjs'
test('standalone graph escapes source payload and its actual script parses',()=>{
 const html=cpuProfileHtml({nodes:[{id:1,function:'</script><script>throw 1',url:'source.js',line:1,exclusiveMs:2,inclusiveMs:2,sampleCount:2,children:[]}],topExclusive:[{id:1}]})
 assert.equal(html.split('</script>').length,2)
 new Function(html.split('<script>')[1].split('</script>')[0])
 assert.match(html,/exclusiveMs/);assert.match(html,/inclusiveMs/);assert.match(html,/sampleCount/)
})
