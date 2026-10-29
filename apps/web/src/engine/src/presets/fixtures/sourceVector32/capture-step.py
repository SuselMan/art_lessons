"""Select actual Samsung ISA records; check CLOSED-domain authored arithmetic.
No expected instruction output is generated: expected bits are capture bytes.
"""
import argparse,hashlib,json,math,struct
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--capture',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
b=a.capture.read_bytes();sha=hashlib.sha256(b).hexdigest();assert sha=='cdfe52191e0e104297f13337adedc6fbab742149004ec1f18e30ad77047a2862';assert len(b)==64+155636*16
number=lambda u:struct.unpack('<f',struct.pack('<I',u))[0]
def bits(v):
 try:return struct.unpack('<I',struct.pack('<f',v))[0]
 except OverflowError:return 0xff800000 if v<0 else 0x7f800000
f=lambda v:number(bits(v))
rows=[];checked=wrong=product_wrong=0
for index in range(155636):
 input_bits,estimate_bits,step_bits,refined_bits=struct.unpack_from('<IIII',b,64+index*16);x=number(input_bits);r=number(estimate_bits)
 if x>0 and math.isfinite(x) and not math.isnan(r):
  checked+=1;step=f(2-x*r);wrong+=bits(step)!=step_bits;product_wrong+=bits(f(step*r))!=refined_bits
  if index%137==0 or not math.isfinite(r) or x<2**-125:rows.append(dict(index=index,inputBits=input_bits,estimateBits=estimate_bits,stepBits=step_bits,refinedBits=refined_bits))
assert (checked,wrong,product_wrong,len(rows))==(147405,0,0,1126)
out=dict(scope='actual Samsung FPCR0 instruction data; selected closedpositive denominator domain, NOT composite dispatch',captureSha256=sha,checked=checked,wrong=wrong,productWrong=product_wrong,cases=rows)
a.output.write_text(json.dumps(out,separators=(',',':'))+'\n')
