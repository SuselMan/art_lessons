from pathlib import Path
import sys,struct,json,hashlib,subprocess,collections,time,os,datetime
sys.dont_write_bytecode=True
from unicorn import *
from unicorn import arm64_const as R
P=Path(__file__).parent;start=time.time();job={'pid':os.getpid(),'owner':'stamp_lifecycle_next','command':sys.argv,'expiresUTC':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=5)).isoformat(),'state':'running'};(P/'installed-generic-sc4-job.json').write_text(json.dumps(job,indent=2));adb=['/home/suselman/tools/platform-tools/adb','-s','192.168.1.36:38415'];assert subprocess.check_output(adb+['shell','getprop','ro.serialno'],text=True).strip()=='R52RB0JXVSY'
apk=next(x[8:]for x in subprocess.check_output(adb+['shell','pm','path','org.krita'],text=True).splitlines()if x.endswith('/split_config.arm64_v8a.apk'))
u=Uc(UC_ARCH_ARM64,UC_MODE_ARM);u.ctl_set_cpu_model(R.UC_CPU_ARM64_A72);u.reg_write(R.UC_ARM64_REG_CPACR_EL1,3<<20);libs=[];symbols={};imports={};pins=[('libkritapigment_arm64-v8a.so',3694016,'230ccf905226f4324ffdf8c7239e8be90f0506cfadda25393d1ba014ab0bb783'),('libQt5Core_arm64-v8a.so',5518824,'78fc3da8d316ce7de1d957e3b20d7462b20245d4d797860f1946f797f7946ef9')]
for i,(name,size,sha)in enumerate(pins):
 data=subprocess.check_output(adb+['exec-out','unzip','-p',apk,'lib/arm64-v8a/'+name],timeout=30);assert len(data)==size and hashlib.sha256(data).hexdigest()==sha
 e=struct.unpack_from('<16sHHIQQQIHHHHHH',data);ss=[struct.unpack_from('<IIQQQQIIQQ',data,e[6]+n*e[11])for n in range(e[12])];ph=[struct.unpack_from('<IIQQQQQQ',data,e[5]+n*e[9])for n in range(e[10])];loads=[x for x in ph if x[0]==1];base=0x10000000+i*0x10000000;top=max((x[3]+x[6]+4095)//4096*4096 for x in loads);u.mem_map(base,top)
 for _,fl,off,va,pa,fs,ms,al in loads:u.mem_write(base+va,data[off:off+fs])
 dyn={};rel=[]
 for s in ss:
  if s[1]!=11:continue
  names=data[ss[s[6]][4]:ss[s[6]][4]+ss[s[6]][5]]
  for n,off in enumerate(range(s[4],s[4]+s[5],s[9])):
   no,info,other,idx,val,sz=struct.unpack_from('<IBBHQQ',data,off);nm=names[no:names.find(b'\0',no)].decode();dyn[n]=nm
   if idx and val:symbols.setdefault(nm,base+val)
 for s in ss:
  if s[1]==4:
   for off in range(s[4],s[4]+s[5],s[9]):
    a,info,add=struct.unpack_from('<QQq',data,off);rel.append((a,info&0xffffffff,dyn.get(info>>32),add))
 libs.append((base,top,loads,rel));del data
TRAP=0x30000000;MEM=0x40000000;STACK=0x41000000;TLS=0x42000000;HEAP=0x43000000;STOP=0x44000000
for a,n in [(TRAP,0x10000),(MEM,0x10000),(STACK,0x10000),(TLS,4096),(HEAP,0x100000),(STOP,4096)]:u.mem_map(a,n)
for base,top,loads,rel in libs:
 for a,k,n,add in rel:
  if k==1027:v=base+add
  elif k in [257,1025,1026]:
   if n in symbols:v=symbols[n]+add
   else:
    if n not in imports:imports[n]=TRAP+len(imports)*4
    v=imports[n]+add
  else:continue
  u.mem_write(base+a,struct.pack('<Q',v))
for base,top,loads,rel in libs:
 u.mem_protect(base,top,UC_PROT_READ)
 for _,fl,off,va,pa,fs,ms,al in loads:u.mem_protect(base+(va&~4095),((va+ms+4095)&~4095)-(va&~4095),(UC_PROT_READ if fl&4 else 0)|(UC_PROT_WRITE if fl&2 else 0)|(UC_PROT_EXEC if fl&1 else 0))
traps={v:k for k,v in imports.items()};state={};hooks=collections.Counter()
def rr(n):return u.reg_read(getattr(R,'UC_ARM64_REG_X'+str(n)))
def ret(v=0):u.reg_write(R.UC_ARM64_REG_X0,v);u.reg_write(R.UC_ARM64_REG_PC,rr(30))
def code(uc,a,n,_):
 state['steps']+=1
 if state['steps']>300000:raise RuntimeError('instruction budget')
 if a not in traps:return
 nm=traps[a];hooks[nm]+=1;x,y,z=rr(0),rr(1),rr(2)
 if nm in ['malloc','calloc','_Znwm','_Znam']:
  amount=x*y if nm=='calloc'else x;assert amount<=65536;ptr=HEAP+state['heap'];state['heap']+=(amount+31)//16*16;assert state['heap']<0x100000;u.mem_write(ptr,bytes(amount));state['allocations'][ptr]=amount;ret(ptr)
 elif nm in ['free','_ZdlPv','_ZdaPv']:
  assert x in state['allocations'];del state['allocations'][x];ret()
 elif nm=='realloc':
  assert x==0,'nonempty realloc unsupported';assert y<=65536;ptr=HEAP+state['heap'];state['heap']+=(y+31)//16*16;ret(ptr)
 elif nm in ['memcpy','memmove','memset','memcmp']:
  assert z<=65536
  if nm=='memset':
   assert any(p<=x and x+z<=p+n for p,n in state['allocations'].items());u.mem_write(x,bytes([y&255])*z);ret(x)
  elif nm=='memcmp':aa=bytes(u.mem_read(x,z));bb=bytes(u.mem_read(y,z));ret(0 if aa==bb else (1 if aa>bb else 0xffffffffffffffff))
  else:u.mem_write(x,bytes(u.mem_read(y,z)));ret(x)
 else:raise RuntimeError('unexpected import '+nm+' at '+hex(a))
u.hook_add(UC_HOOK_CODE,code)
def write_guard(uc,access,a,n,value,_):
 if STACK<=a and a+n<=STACK+65536:return
 if HEAP<=a and a+n<=HEAP+state['heap']:return
 if MEM+0x300<=a and a+n<=MEM+0x304:return
 raise RuntimeError('unexpected guest write '+hex(a)+'/'+str(n))
u.hook_add(UC_HOOK_MEM_WRITE,write_guard)
mapping=json.loads((P/'installed-generic-sc4-color-mapping.json').read_text());vts={}
for mode,needle in [('multiply','cfMultiplyIh'),('lighten','cfLightenOnlyIh'),('colorDodge','CFColorDodgeh'),('overlay','9CFOverlayIh')]:
 v=next(v for v in mapping['vtableEvidence']if 'KoBgrU8Traits'in v['class']and needle in v['class']);vts[mode]=int(v['vtableTypeInfoSlot'],16)+8
fixture=Path('apps/web/src/engine/src/presets/fixtures/sourceRgba8Separable/source-law.native.json');cases=json.loads(fixture.read_text())['cases']
for mode in vts:
 cases.append({'mode':mode,'src':[1,2,3,91],'dst':[4,5,6,0],'opacity':248/255,'mask':-1,'expected':[1,2,3,88],'witness':'MULT3-absent-mask'})
 cases.append({'mode':mode,'src':[201,22,88,255],'dst':[19,200,101,73],'opacity':0,'mask':-1,'expected':[19,200,101,73],'witness':'outer-opacity0-unchanged'})
report={'scope':'Original installed ARM64 full vtable composite entry, constructed consumed ABI, original Qt QBitArray; libc allocation/memory shims only. Not physicalARM/GUI/factory proof.','pins':pins,'status':'RUNNING','cases':[],'hooks':{},'arithmeticHooks':0}
def bgr(v):return bytes([v[2],v[1],v[0],v[3]])
try:
 for i,c in enumerate(cases):
  for n in range(31):u.reg_write(getattr(R,'UC_ARM64_REG_X'+str(n)),0)
  for n in range(32):u.reg_write(getattr(R,'UC_ARM64_REG_Q'+str(n)),0)
  u.reg_write(R.UC_ARM64_REG_SP,STACK+65520);u.reg_write(R.UC_ARM64_REG_X30,STOP);u.reg_write(R.UC_ARM64_REG_TPIDR_EL0,TLS);u.reg_write(R.UC_ARM64_REG_FPCR,0);u.mem_write(TLS+40,struct.pack('<Q',0x1234));u.mem_write(MEM,bytes(65536));state.update(steps=0,heap=0,allocations={})
  obj=MEM;params=MEM+0x100;src=MEM+0x200;dst=MEM+0x300;mask=MEM+0x400;flags=MEM+0x500
  u.mem_write(obj,struct.pack('<Q',0x10000000+vts[c['mode']]));u.mem_write(src,bgr(c['src']));u.mem_write(dst,bgr(c['dst']));u.mem_write(flags,struct.pack('<iii4xq',-1,0,0,24))
  p=bytearray(80);struct.pack_into('<Qi4xQi4xQiii',p,0,dst,4,src,4,mask if c['mask']>=0 else 0,1,1,1);struct.pack_into('<fff',p,52,c['opacity'],1,1);struct.pack_into('<Q',p,72,flags);u.mem_write(params,bytes(p));u.mem_write(mask,bytes([max(0,c['mask'])]));entry=struct.unpack('<Q',u.mem_read(0x10000000+vts[c['mode']]+16,8))[0]
  u.reg_write(R.UC_ARM64_REG_X0,obj);u.reg_write(R.UC_ARM64_REG_X1,params);u.emu_start(entry,STOP,timeout=3000000,count=300000);assert u.reg_read(R.UC_ARM64_REG_PC)==STOP
  assert not state['allocations'];assert bytes(u.mem_read(params,80))==p and bytes(u.mem_read(src,4))==bgr(c['src']) and bytes(u.mem_read(dst+4,16))==bytes(16)
  actual=list(bgr(list(u.mem_read(dst,4))));report['cases'].append({'id':i,'mode':c['mode'],'witness':c.get('witness','source-law-fixture'),'actual':actual,'expected':c['expected'],'wrong':actual!=c['expected'],'steps':state['steps']})
 report['status']='PASS';report['guestWriteGuards']=True;report['immutableParamsSourceAndDestinationTail']=True;report['wrongCases']=sum(c['wrong']for c in report['cases'])
except Exception as e:report['status']='FAIL';report['error']=str(e);report['PC']=hex(u.reg_read(R.UC_ARM64_REG_PC));raise
finally:
 report['seconds']=time.time()-start;report['hooks']=dict(hooks);report['scriptSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();report['inputFixtureSHA256']=hashlib.sha256(fixture.read_bytes()).hexdigest();report['vtableAddresses']={k:hex(v) for k,v in vts.items()};report['originalQtBitArrayConstructor']=hex(symbols['_ZN9QBitArrayC1Eib']);job['state']='finished';(P/'installed-generic-sc4-job.json').write_text(json.dumps(job,indent=2));(P/'installed-generic-sc4-execution.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='cases'}))
