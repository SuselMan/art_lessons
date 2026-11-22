import base64
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from brush_contract import Catalog
from krita_import import convert_krita
from mypaint_import import mypaint_preset
from test_krita import kpp


class MyPaintCategoryTests(unittest.TestCase):
    def document(self, inner):
        return {'version':3,'settings':{'eraser':{'base_value':inner,'inputs':{'pressure':[[0,0],[1,1]]}}}}

    def test_kpp_and_png_myb_erase_values_and_host_timing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for inner in (0,1):
                for outer in (False,True):
                    for timer in (False,True):
                        with self.subTest(inner=inner,outer=outer,timer=timer):
                            key=f'{inner}-{outer}-{timer}'
                            encoded=base64.b64encode(json.dumps(self.document(inner)).encode()).decode()
                            fields='<param name="MyPaint/json" type="bytearray">'+encoded+'</param><param name="EraserMode">'+str(outer).lower()+'</param>'
                            if timer:fields+='<param name="PaintOpSettings/isAirbrushing">true</param><param name="PaintOpSettings/rate">20</param>'
                            raw=kpp(engine='mypaintbrush',mode='normal',resources=fields)
                            results=[]
                            for ext in ('kpp','myb'):
                                path=root/(key+'.'+ext);path.write_bytes(raw)
                                catalog=Catalog(root/(key+'-'+ext));convert_krita(path,catalog)
                                self.assertEqual(catalog.skipped,[]);self.assertEqual(len(catalog.brushes),1)
                                d=catalog.brushes[0]['descriptor'];self.assertEqual(d['category'],'paint')
                                self.assertEqual(d['mypaint']['erase'],outer)
                                setting=next(x for x in d['mypaint']['settings'] if x['id']==32)
                                self.assertEqual(setting['base'],inner);self.assertEqual(setting['inputs'][0]['points'],[[0,0],[1,1]])
                                self.assertEqual(d['version'],195 if timer else 55)
                                results.append(d)
                            self.assertEqual(results[0],results[1])

    def test_json_bundle_and_standalone_keep_internal_eraser(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);bundle=root/'brushes.bundle'
            with zipfile.ZipFile(bundle,'w') as z:
                for inner in (0,1):z.writestr(f'paintoppresets/{inner}.myb',json.dumps(self.document(inner)))
            catalog=Catalog(root/'bundle');convert_krita(bundle,catalog)
            self.assertEqual(catalog.skipped,[]);self.assertEqual(len(catalog.brushes),2)
            for inner in (0,1):
                record=next(x for x in catalog.brushes if x['source']==f'{inner}.myb')
                direct=mypaint_preset(json.dumps(self.document(inner)).encode(),f'{inner}.myb',Catalog(root/f'direct-{inner}'))
                for d in (record['descriptor'],direct['descriptor']):
                    self.assertEqual(d['category'],'paint');self.assertFalse(d['mypaint']['erase'])
                    self.assertEqual(next(x for x in d['mypaint']['settings'] if x['id']==32)['base'],inner)


if __name__=='__main__':
    unittest.main()
