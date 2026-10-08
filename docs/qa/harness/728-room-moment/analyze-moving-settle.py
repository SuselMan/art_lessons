"""Export canonical final premultiplied material as straight-alpha PNG.
No new paper shading, quality score or expected same-model exactness.
"""
import hashlib,importlib.util,json,pathlib,struct,sys,zlib
spec=importlib.util.spec_from_file_location('f',pathlib.Path(__file__).with_name('analyze-held-factors.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=pathlib.Path(sys.argv[1]);report=json.loads((r/'report.json').read_text())
if not report.get('valid')or len(report.get('arms',[]))!=2:raise ValueError('Invalid final capture')
if report['arms'][0]['tapeSha256']!=report['arms'][1]['tapeSha256']or report['arms'][0]['paper']!=report['arms'][1]['paper']:raise ValueError('Different tape/paper')
fields={};out={}
def rgba_png(path,b,w=1024,h=1024):
 def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
 raw=b''.join(b'\0'+b[y*w*4:(y+1)*w*4]for y in range(h));path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
for arm in report['arms']:
 v=arm['variant'];data=(r/f'{v}-material.rgba').read_bytes()
 if len(data)!=4194304 or hashlib.sha256(data).hexdigest()!=arm['material']['sha256']:raise ValueError('Final SHA/size mismatch')
 fields[v]=data;straight=bytearray(data);xy=[]
 for i in range(0,len(data),4):
  alpha=data[i+3]
  if alpha:xy.append(((i//4)%1024,(i//4)//1024))
  for c in range(3):straight[i+c]=min(255,round(data[i+c]*255/alpha))if alpha else 0
 rgba_png(r/f'{v}-material.png',straight)
 out[v]={'nonzeroAlpha':len(xy),'bounds':{'minX':min(x for x,y in xy),'maxX':max(x for x,y in xy),'minY':min(y for x,y in xy),'maxY':max(y for x,y in xy)}if xy else None,'sums':[sum(data[c::4])for c in range(4)]}
out['RGBA']=m.difference(fields['literal'],fields['A']);out['channels']=[m.difference(fields['literal'][c::4],fields['A'][c::4])for c in range(4)]
out['scope']='Canonical premultiplied final material exported with ordinary straight-alpha PNG conversion, no wet/camera/paper compose changes. New source model comparison, not quality score or same-model exact gate.'
(r/'settle-analysis.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
