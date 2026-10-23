import jwt from 'jsonwebtoken'
import { io } from 'socket.io-client'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const token = jwt.sign({sub:'qa-missing-user-695'},'e2e-not-a-secret-e2e-not-a-secret',{expiresIn:3600})
const response = await fetch('http://127.0.0.1:4593/api/me',{headers:{cookie:`al_id=${token}`}})
assert.equal(response.status,200)
const user = await response.json()
console.log('HTTP', JSON.stringify(user))
assert.equal(typeof user.userId,'string')
assert.notEqual(user.userId,'qa-missing-user-695')
assert.ok(response.headers.get('set-cookie')?.includes('al_id='))
const socket = io('http://127.0.0.1:4593',{transports:['websocket'],extraHeaders:{Cookie:`al_id=${token}`}})
try {
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject)})
 const roomId = 'qa695-'+Date.now()
 const result = await socket.timeout(10000).emitWithAck('create_room',{room:{id:roomId,name:'QA missing identity',paper:'flat',infinite:false,canvasWidth:800,canvasHeight:600}})
 console.log('ROOM ACK',JSON.stringify(result))
 assert.equal(result.ok,true)
 let row=''
 for(let i=0;i<50;i++) {
  row=execFileSync('docker',['exec','grafetto_pg_e2e_101','psql','-U','e2e','-d','e2e','-Atc',`SELECT r.id,r."ownerId",u.id FROM "Room" r JOIN "User" u ON u.id=r."ownerId" WHERE r.id='${roomId}';`],{encoding:'utf8'}).trim()
  if(row)break
  await new Promise(resolve=>setTimeout(resolve,100))
 }
 assert.ok(row)
 assert.ok(!row.includes('qa-missing-user-695'))
 console.log('PERSISTED',row)
} finally {socket.disconnect()}
