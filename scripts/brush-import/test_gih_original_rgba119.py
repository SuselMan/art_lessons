from pathlib import Path
import tempfile,unittest,struct,copy,json,base64,hashlib,math
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from test_krita import kpp
SIZES=[(4,2),(8,6),(4,2)]
def pipe(dims=[('xtilt',5)],sizes=SIZES,actual=3):
 n=math.prod(r for m,r in dims);header=f'{n} dim:{len(dims)} ncells:{n} '+' '.join(f'rank{i}:{r} sel{i}:{m}'for i,(m,r)in enumerate(dims));parts=[];planes=[]
 for i,(w,h)in enumerate(sizes[:actual]):
  color=[(255,0,0),(0,255,0),(0,0,255)][i];rgba=bytes(v for y in range(h)for x in range(w)for v in(*color,128 if i==1 else 255));parts.append(struct.pack('>7I',29,2,w,h,4,0x47494d50,25)+b'\0'+rgba);planes.append(rgba)
 return('Own119\n'+header+'\n').encode()+b''.join(parts)
class GihOriginalRgba119Tests(unittest.TestCase):
 def imported(self,tmp,dims=[('xtilt',5)],sizes=SIZES,application=1,engine='paintbrush',extra='',actual=3):
  root=Path(tmp);data=kpp('<Brush type="gbr_brush" filename="own119.gih" brushApplication="'+str(application)+'" scale="1"/>',resources=extra,engine=engine);f=root/'Own119.kpp';f.write_bytes(data);c=convert.Catalog(root/'out');convert_krita(f,c,{'own119.gih':pipe(dims,sizes,actual)});return c,data
 def test_genuine_all119_sensors_literal_RGBA_CAS_samealpha_differentRGB_and_original_identity(self):
  for dims in[[('xtilt',5)],[('ytilt',5)],[('angular',5)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    c,original=self.imported(tmp,dims);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],119);self.assertEqual(finalize_identity(copy.deepcopy(d),original)['id'],d['id']);a=d['tip']['animation'];color=d['tip']['color'];self.assertEqual([(v['sourceWidth'],v['sourceHeight'])for v in a['geometry']['frames']],SIZES);self.assertEqual(a['frames'][0],a['frames'][2]);self.assertNotEqual(color['frames'][0],color['frames'][2]);self.assertEqual(color['planes'],color['frames'][0])
    for i,(w,h)in enumerate(SIZES):
     side=c.assets[a['frames'][i]]['size'];ox=(side-w)//2;oy=(side-h)//2
     for channel,aid in enumerate([*color['frames'][i],a['frames'][i]]):
      expected=bytearray(side*side);value=128 if channel==3 and i==1 else 255 if channel==3 or channel==i else 0
      for y in range(h):expected[(y+oy)*side+ox:(y+oy)*side+ox+w]=bytes([value])*w
      self.assertEqual(aid,'asset:'+hashlib.sha256(expected).hexdigest());self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes(expected))
 def test_foreign_material_gradient_and_child_scope_remain_closed_old86_118_unchanged(self):
  for kwargs in[{'engine':'hairybrush'},{'application':2},{'application':3},{'actual':1},{'extra':'<param name="PressureScatter">true</param><param name="ScatterValue">.2</param><param name="ScatterUseCurve">false</param>'}]:
   with self.subTest(kwargs=kwargs),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,**kwargs);self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped);self.assertEqual(c.assets,{})
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,[('incremental',3)],application=1);self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes[0]['descriptor']['version'],86)
  from test_gih_geometry118 import data as alpha118_data
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);f=root/'Old118.kpp';f.write_bytes(kpp('<Brush type="gbr_brush" filename="old118.gih" scale="1"/>'));c=convert.Catalog(root/'out');convert_krita(f,c,{'old118.gih':alpha118_data([('xtilt',5)])});self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes[0]['descriptor']['version'],118);self.assertNotIn('color',c.brushes[0]['descriptor']['tip'])
 def test_portable119_positive_and_closed_shape_plane_dimensions_padding_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp);env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(p,good);self.assertEqual(good.brushes,c.brushes)
   for case in['revision118','equal','missingGeometry','missingRGB','rootRGB','wrongSide','gradient','sampling','material','child','dual','texture','erase','timer','RGBpadding']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];t=d['tip'];a=t['animation'];rgb=t['color']
    if case=='revision118':d['version']=118
    elif case=='equal':a['geometry']['frames']=[copy.deepcopy(a['geometry']['frames'][0])for _ in a['frames']]
    elif case=='missingGeometry':a.pop('geometry')
    elif case=='missingRGB':rgb['frames'].pop()
    elif case=='rootRGB':rgb['planes']=rgb['frames'][1][:]
    elif case=='wrongSide':rgb['frames'][1][0]=rgb['frames'][0][0]
    elif case=='gradient':t['color']={'gradient':{'gray':a['frames'][0]}}
    elif case=='sampling':t['imageSampling']={}
    elif case=='material':t['material']={}
    elif case=='child':
     child=copy.deepcopy(d);t.pop('animation');t.pop('color');d['behavior']['dual']={'brush':child,'blendMode':'normal'}
    elif case=='dual':d['behavior']['dual']={}
    elif case=='texture':d['texture']={}
    elif case=='erase':d['behavior']['erase']=True
    elif case=='timer':d['behavior']['timing']={}
    else:
     old=rgb['frames'][0][1];raw=bytearray(base64.b64decode(bad['assets'][old]));raw[0]=255;h=hashlib.sha256(raw).hexdigest();aid='asset:'+h;bad['assets'][aid]=base64.b64encode(raw).decode();bad['library']['assets'].append({'id':aid,'size':4,'file':h+'.bin'});rgb['frames'][0][1]=aid;rgb['planes'][1]=aid
    p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
