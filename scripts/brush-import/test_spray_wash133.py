"""Native format fixture derivatives, NOT stock artwork or stock source identities."""
import io,json,copy,base64,struct,tempfile,unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from spray_wash133 import spray_wash133_scope
FIXTURE=json.loads((Path(__file__).parent/'fixtures/spray_wash133_controls.json').read_text())
def authored133(tip=False,action='2',extra=None):
    row=FIXTURE['presets'][1 if tip else 0];params=copy.deepcopy(row['params']);params['PaintOpAction']=action
    # Keep all real controls, substitute only resource identity/artwork.
    if tip:params['brush_definition']='<Brush type="gbr_brush" filename="own133.gih" scale="1" ColorAsMask="1" spacing="0.25"/>'
    params.update(extra or{});root=ET.Element('Preset',{'paintopid':'spraybrush','name':'Own Wash133 derivative'})
    for k,v in params.items():ET.SubElement(root,'param',{'name':k}).text=v
    info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();Image.new('RGBA',(2,2),'red').save(out,format='PNG',pnginfo=info)
    planes=[bytes(255 if x==y or x==0 or y==0 else (31*i+17*x+13*y)%256 for y in range(4)for x in range(4))for i in range(7)]
    frames=b''.join(struct.pack('>7I',29,2,4,4,1,0x47494d50,25)+b'\0'+p for p in planes)
    resource=b'Own133\n7 dim:1 rank0:7 sel0:random\n'+frames
    return out.getvalue(),{'own133.gih':resource}if tip else{},planes
class SprayWash133(unittest.TestCase):
    def imported(self,tmp,tip=False,action='2',extra=None):
        raw,resources,planes=authored133(tip,action,extra);p=Path(tmp)/'Own.kpp';p.write_bytes(raw);c=convert.Catalog(Path(tmp)/'native');convert_krita(p,c,resources);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);return c,raw,planes
    def test_native_two_derivatives_keep_original_controls_random7_HSV_timer_and_qualified_new_ID(self):
        for tip in(False,True):
            with self.subTest(tip=tip),tempfile.TemporaryDirectory()as tmp:
                c,raw,planes=self.imported(tmp,tip);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],133);self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');self.assertTrue(spray_wash133_scope(d));self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id']);self.assertTrue(any(n['feature']=='sprayWash'and n['status']=='approximate'for n in c.brushes[0]['compatibility']))
                if tip:
                    self.assertEqual(d['behavior']['timing'],{'version':1,'rate':20,'ignoreDistanceSpacing':False});self.assertEqual(d['tip']['animation']['mode'],'random');self.assertEqual(len(d['tip']['animation']['frames']),7)
                    for index,aid in enumerate(d['tip']['animation']['frames']):self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),planes[index])
                    self.assertEqual(d['spray']['color'],{'perParticle':False,'hue':58/180,'saturation':.32,'value':.19,'randomOpacity':True})
                else:self.assertEqual((d['spray']['particle']['width'],d['spray']['particle']['height']),(25,22));self.assertNotIn('timing',d['behavior'])
    def test_legacy_buildUp_derivatives_remain43_directOver_noWashnote(self):
        for tip in(False,True):
            with tempfile.TemporaryDirectory()as tmp:
                c,raw,_=self.imported(tmp,tip,'1');d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],43);self.assertEqual(d['behavior']['rendering']['accumulation'],'directOver');self.assertNotIn('sprayWash',[n['feature']for n in c.brushes[0]['compatibility']]);self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id'])
    def test_portable_whole_profile_scope_rejects_before_any_output(self):
        with tempfile.TemporaryDirectory()as tmp:
            c,_,_=self.imported(tmp,True);env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(p,good);self.assertEqual(good.brushes,c.brushes)
            cases=['version','flow','flowCurve','source','image','dual','child','erase','texture','material','profile','geometry','cloneNull','mixerNull','hatchingNull','wetEdges','misplacedTime','badCDF','population','sprayVersionBool']
            for case in cases:
                bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];b=d['behavior'];t=d['tip']
                if case=='version':d['version']=132
                elif case=='flow':d['flow']=.5
                elif case=='flowCurve':d['flowByPressure']=[[0,.5],[1,1]]
                elif case=='source':d['spray']['color']['sampleInput']=True
                elif case=='image':d['spray']['particle']['image']=True
                elif case=='dual':b['dual']={}
                elif case=='child':
                    child=copy.deepcopy(d);b['rendering']['accumulation']='directOver';b['dual']={'brush':child,'sampling':'independent','blendMode':'subtract'}
                elif case=='erase':b['erase']=True
                elif case=='texture':d['texture']={}
                elif case=='material':t['material']={}
                elif case=='profile':t['profile']={}
                elif case=='geometry':t['animation']['geometry']={}
                elif case.endswith('Null'):d[case[:-4]]=None
                elif case=='wetEdges':b['rendering']['wetEdges']=.5
                elif case=='badCDF':d['spray']['angular']='invalid'
                elif case=='population':d['spray']['count']=1025
                elif case=='sprayVersionBool':d['spray']['version']=True
                else:b['modulations']={'flow':[{'control':'time','minimum':0,'jitter':0,'period':200,'periodic':False}]}
                p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/case)
                with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(p,out)
                self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
