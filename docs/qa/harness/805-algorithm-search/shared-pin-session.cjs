// Owned QA browsers only: signed short-lived session, no PIN or cookie persisted.
const fs=require('node:fs'),crypto=require('node:crypto'),os=require('node:os'),path=require('node:path');
function sharedPinCookie(){const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/health-access/config.json'))),payload=Math.floor(Date.now()/1000+3600)+'.'+crypto.randomBytes(16).toString('hex');return{name:'pecni_session',value:payload+'.'+crypto.createHmac('sha256',Buffer.from(config.key,'hex')).update(payload).digest('hex'),domain:'.pecni.com',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}}
module.exports={sharedPinCookie};
