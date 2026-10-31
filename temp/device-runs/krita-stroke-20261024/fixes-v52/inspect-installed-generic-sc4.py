"""Read-only installed-library evidence; no APK/library retained or app launched."""
from pathlib import Path
import sys,subprocess,struct,json,hashlib,collections
sys.path.insert(0,'/home/suselman/.cache/codex-qa/brush-installed-disassembly52')

r=Path(__file__).parent
adb=['/home/suselman/tools/platform-tools/adb','-s','192.168.1.36:38415']
serial=subprocess.check_output(adb+['shell','getprop','ro.serialno'],text=True).strip()
assert serial=='R52RB0JXVSY'
apk=next(s.removeprefix('package:') for s in subprocess.check_output(adb+['shell','pm','path','org.krita'],text=True).splitlines() if s.endswith('/split_config.arm64_v8a.apk'))
data=subprocess.check_output(adb+['exec-out','unzip','-p',apk,'lib/arm64-v8a/libkritapigment_arm64-v8a.so'],timeout=30)
sha=hashlib.sha256(data).hexdigest();assert sha=='230ccf905226f4324ffdf8c7239e8be90f0506cfadda25393d1ba014ab0bb783'
e=struct.unpack_from('<16sHHIQQQIHHHHHH',data);assert e[0][:6]==b'\x7fELF\x02\x01' and e[2]==183
sections=[struct.unpack_from('<IIQQQQIIQQ',data,e[6]+i*e[11]) for i in range(e[12])]
def body(section):return data[section[4]:section[4]+section[5]]
def cstring(raw,offset):return raw[offset:raw.index(b'\0',offset)].decode('utf8',errors='replace')
sectionNames=body(sections[e[13]])
sectionSummary=[{'name':cstring(sectionNames,x[0]),'type':hex(x[1]),'addr':hex(x[3]),'offset':x[4],'size':x[5],'entry':x[9]} for x in sections]
typeInfos=[]
for raw in data.split(b'\0'):
 if (b'GenericSC' in raw and any(x in raw for x in [b'Multiply',b'Lighten',b'Dodge',b'Overlay'])) or (b'GenericHSL' in raw and b'CFColorI7HSYTypeh' in raw):
  name=raw.decode('utf8',errors='replace'); offset=data.find(raw+b'\0');sec=next((x for x in sections if x[4]<=offset<x[4]+x[5] and x[1]!=8),None)
  if sec:typeInfos.append({'name':name,'offset':offset,'address':hex(sec[3]+offset-sec[4])})
symbols=[]
for section in sections:
 if section[1] not in [2,11]:continue
 strings=body(sections[section[6]])
 for at in range(section[4],section[4]+section[5],section[9]):
  name,info,other,shndx,value,size=struct.unpack_from('<IBBHQQ',data,at)
  if shndx and name:
   text=cstring(strings,name)
   if 'neon64' in text and ('Over32' in text or 'AlphaDarken32' in text or 'AlphaDarkenHard32' in text or 'AlphaDarkenCreamy32' in text):symbols.append({'name':text,'type':info&15,'value':value,'size':size,'section':shndx})
relocations={}
for sec in sections:
 if sec[1]==4:
  for at in range(sec[4],sec[4]+sec[5],sec[9]):
   address,info,addend=struct.unpack_from('<QQq',data,at)
   if info&0xffffffff==1027:relocations[address]=addend
def vaBytes(address,size):
 sec=next(x for x in sections if x[1]!=8 and x[3]<=address and address+size<=x[3]+x[5])
 off=sec[4]+address-sec[3];return data[off:off+size]
def pointer(address):return relocations.get(address,struct.unpack('<Q',vaBytes(address,8))[0])
eh=next(x for x in sections if cstring(sectionNames,x[0])=='.eh_frame_hdr');ehData=body(eh)
assert ehData[:4]==bytes([1,0x1b,3,0x3b])
count=struct.unpack_from('<I',ehData,8)[0];functionSizes={}
for i in range(count):
 pcDelta,fdeDelta=struct.unpack_from('<ii',ehData,12+i*8);pc=eh[3]+pcDelta;fde=eh[3]+fdeDelta
 fdeHeader=vaBytes(fde,16);encodedPC,size=struct.unpack_from('<iI',fdeHeader,8)
 assert fde+8+encodedPC==pc
 functionSizes[pc]=size
vtableEvidence=[]
for item in typeInfos:
 address=int(item['address'],16)
 typeInfosAt=[addr-8 for addr,value in relocations.items() if value in [address,address-1]]
 item['typeInfoObjects']=[{'address':hex(v),'refs':[{'offset':hex(a),'addend':hex(b),'following':[{'at':hex(a+8+i*8),'value':hex(pointer(a+8+i*8)),'hasFDE':pointer(a+8+i*8) in functionSizes} for i in range(5)]} for a,b in relocations.items() if abs(b-v)<16]} for v in typeInfosAt]
 for typeAt in typeInfosAt:
  for slot,value in relocations.items():
   if value!=typeAt or pointer(slot-8)!=0:continue
   targets=[]
   for j in range(3):
    target=pointer(slot+8+j*8)
    if target not in functionSizes:continue
    targets.append({'slot':j,'address':hex(target),'size':functionSizes[target]})
    symbols.append({'name':item['name']+'::vtableSlot'+str(j),'type':2,'value':target,'size':functionSizes[target],'section':next(k for k,x in enumerate(sections) if x[3]<=target< x[3]+x[5] and x[1]!=8)})
   if targets:vtableEvidence.append({'class':item['name'],'typeInfoAddress':hex(typeAt),'vtableTypeInfoSlot':hex(slot),'functionPointers':targets})
from capstone import Cs,CS_ARCH_ARM64,CS_MODE_LITTLE_ENDIAN
D=Cs(CS_ARCH_ARM64,CS_MODE_LITTLE_ENDIAN);pending=[int(f['address'],16) for v in vtableEvidence if 'KoBgrU8Traits' in v['class'] for f in v['functionPointers'] if f['slot']==2];done={};asm=[]
while pending and len(done)<160:
 addr=pending.pop(0)
 if addr in done:continue
 size=functionSizes[addr];code=vaBytes(addr,size);ins=list(D.disasm(code,addr));calls=[int(i.op_str[1:],0) for i in ins if i.mnemonic in ['b','bl'] and i.op_str.startswith('#') and int(i.op_str[1:],0) in functionSizes]
 done[addr]={'address':hex(addr),'size':size,'sha256':hashlib.sha256(code).hexdigest(),'calls':[hex(x) for x in calls],'mnemonics':dict(collections.Counter(i.mnemonic for i in ins))}
 asm.append('\n; '+hex(addr)+' '+done[addr]['sha256']+'\n'+'\n'.join(f'{i.address:08x}: {i.bytes.hex()} {i.mnemonic} {i.op_str}'for i in ins));pending.extend(x for x in calls if x not in done)
report={'scope':'Pinned installed ARM64 RTTI/RELA/FDE mapping only; NOT actual dispatch execution or GUI proof','librarySHA256':sha,'libraryBytes':len(data),'typeInfoStrings':typeInfos,'vtableEvidence':vtableEvidence,'functions':list(done.values()),'retainedAPKOrLibrary':False}
(r/'installed-generic-sc4-color-mapping.json').write_text(json.dumps(report,indent=2)+'\n')
(r/'installed-generic-sc4-color-selected.asm').write_text('\n'.join(asm)+'\n')
print(json.dumps({'types':len(typeInfos),'vtables':len(vtableEvidence),'functions':len(done)},indent=2))
