from pathlib import Path
import struct,json,hashlib
r=Path(__file__).parent
bits=lambda x:struct.unpack('<I',struct.pack('<f',x))[0]
a=[];ranges=[]
def group(name,values):
 start=len(a);a.extend(values);ranges.append({'name':name,'start':start,'count':len(a)-start})
group('alpha16_integer_1_through_65535',(bits(float(i)) for i in range(1,65536)))
group('alpha16_normalized_1_through_65535',(bits(i/65535) for i in range(1,65536)))
state=0x49f3ec1;random=[]
for i in range(16384):
 state^=(state<<13)&0xffffffff;state^=state>>17;state^=(state<<5)&0xffffffff;state&=0xffffffff;random.append(state)
group('xorshift32_raw_f32_all_sign_exponent_domains',random)
group('composite_denominator_0_through_255_grid',(bits(i/32) for i in range(8161)))
group('special_bits',[0,0x80000000,1,0x80000001,0x007fffff,0x807fffff,0x00800000,0x80800000,0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc00000,0xffc00000,0x7f800001,0xff800001,0x3f800000,0xbf800000])
while len(a)%4:a.append(bits(1.))
b=struct.pack('<'+'I'*len(a),*a);(r/'inputs.bin').write_bytes(b)
(r/'inputs.json').write_text(json.dumps({'count':len(a),'ranges':ranges,'sha256':hashlib.sha256(b).hexdigest(),'sum32':sum(a)&0xffffffff,'seed':'0x49f3ec1'},indent=2))
(r/'inputs-count.inc').write_text('.equ INPUT_COUNT, '+str(len(a))+'\n')
