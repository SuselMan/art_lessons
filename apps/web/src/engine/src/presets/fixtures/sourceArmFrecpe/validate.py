"""Validate raw stdout; never execute the native helper or access a device."""
from pathlib import Path
import argparse,struct,json,hashlib
p=argparse.ArgumentParser();p.add_argument('capture',type=Path);p.add_argument('--report',type=Path);a=p.parse_args()
r=Path(__file__).parent;data=a.capture.read_bytes();meta=json.loads((r/'inputs.json').read_text());count=meta['count'];expected=(r/'inputs.bin').read_bytes()
assert len(data)==64+count*16,('length',len(data),64+count*16)
assert data[:8]==b'FRECPE49'
version,n,fpcr,before,after,inputsum,recordsum=struct.unpack_from('<IIQQQII',data,8)
assert version==1 and n==count
assert data[48:64]==bytes(16)
words=struct.unpack_from('<'+'I'*(count*4),data,64)
actualInputs=struct.pack('<'+'I'*count,*words[0::4]);assert actualInputs==expected
assert inputsum==meta['sum32'] and recordsum==(sum(words)&0xffffffff)
report={'captureSHA256':hashlib.sha256(data).hexdigest(),'length':len(data),'records':count,'FPCR':hex(fpcr),'FPSRbefore':hex(before),'FPSRafter':hex(after),'inputSHA256':meta['sha256'],'inputSum32':inputsum,'recordSum32':recordsum,'valid':True,'scope':'actual instruction output only; not Krita factory/composite receipt'}
if a.report:a.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
