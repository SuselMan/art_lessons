"""Genuine public195 Curve Fade lowering and strict unsupported boundaries."""
import base64,copy,io,json,tempfile,unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
from timing195_corpus import corpus195
from native_mask190 import png_preset
from brush_contract import Catalog
from krita_import import convert_krita,preset
from convert import portable_bundle

class CurveFade195Tests(unittest.TestCase):
    def test_public_native_portable_and_legacy_warning_scope(self):
        raw=next(raw for name,engine,raw in corpus195()if name=='host-default-curvebrush')
        def source(sensor='fade',extra=None):
            node=ET.fromstring(Image.open(io.BytesIO(raw)).info['preset'])
            values={'PressureLine width':'true','Line widthUseCurve':'true','Line widthSensor':'<params id="'+sensor+'" length="8"><curve>0,0.15;1,1;</curve></params>'}
            values.update(extra or{})
            for key,value in values.items():ET.SubElement(node,'param',name=key).text=value
            return png_preset(node)
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);path=root/'curve.kpp';path.write_bytes(source());c=Catalog(root/'native');convert_krita(path,c)
            self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1)
            row=c.brushes[0];d=row['descriptor'];self.assertEqual(d['version'],195)
            self.assertEqual(d['curveTrace']['dynamics']['width'][0]['control'],'dabProgress')
            self.assertFalse(any(n['feature']=='activeDynamics'for n in row['compatibility']))
            envelope={'library':c.write(),'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}}
            portable=root/'curve.grafetto-brushes.json';portable.write_text(json.dumps(envelope));out=Catalog(root/'portable');portable_bundle(portable,out);self.assertEqual(out.brushes,c.brushes)
            for label,invalid in [('list',[]),('null',None),('unknown',{'bad':[]}),('width',{'width':{}}),('opacity',{'opacity':[{'control':'unknown'}]})]:
                malformed=copy.deepcopy(envelope);malformed['library']['brushes'][0]['descriptor']['curveTrace']['dynamics']=invalid
                badportable=root/(label+'.grafetto-brushes.json');badportable.write_text(json.dumps(malformed));rejected=Catalog(root/('portable-'+label))
                with self.subTest(label=label),self.assertRaises(ValueError):portable_bundle(badportable,rejected)
                self.assertEqual(rejected.brushes,[]);self.assertEqual(rejected.assets,{})
            legacy_node=ET.fromstring(Image.open(io.BytesIO(source())).info['preset'])
            next(n for n in legacy_node.findall('param')if n.get('name')=='PaintOpSettings/isAirbrushing').text='false'
            legacy=preset(png_preset(legacy_node),'old.kpp',Catalog(root/'old'),{},_default_input_policy=None)
            self.assertNotEqual(legacy['descriptor']['version'],195)
            self.assertTrue(any(n['feature']=='activeDynamics'and n['detail']=='PressureLine width'for n in legacy['compatibility']))
            for label,bad in [('sensor',source('unknown')),('other',source(extra={'PressureUnknown':'true'}))]:
                badpath=root/(label+'.kpp');badpath.write_bytes(bad);rejected=Catalog(root/label);convert_krita(badpath,rejected)
                self.assertEqual(rejected.brushes,[]);self.assertTrue(rejected.skipped)
