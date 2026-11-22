import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

from brush_contract import Catalog
from krita_import import convert_krita
from mypaint_import import mypaint_preset
from convert import validate_portable_profile
from test_krita import kpp


class MybKoResourceTests(unittest.TestCase):
    def document(self, paint_mode=False):
        settings={'hardness':{'base_value':0.6,'inputs':{}}}
        if paint_mode:
            settings['paint_mode']={'base_value':0.8,'inputs':{}}
        return {'version':3,'settings':settings}

    def png_preset(self):
        raw=json.dumps(self.document(True)).encode()
        return kpp(engine='mypaintbrush', resources='<param name="MyPaint/json" type="bytearray">'+base64.b64encode(raw).decode()+'</param>')

    def cli(self, source, output):
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
        return subprocess.run([sys.executable,str(Path(__file__).with_name('convert.py')),str(source),'--output',str(output)],capture_output=True,text=True,env=env)

    def test_standalone_png_uses_same_import_as_kpp(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);raw=self.png_preset();myb=root/'brush.myb';kpp_path=root/'brush.kpp'
            myb.write_bytes(raw);kpp_path.write_bytes(raw)
            result=self.cli(myb,root/'myb-out');self.assertEqual(result.returncode,0,result.stderr)
            actual=json.loads((root/'myb-out'/'manifest.json').read_text())
            expected=Catalog(root/'kpp-out');convert_krita(kpp_path,expected)
            self.assertEqual(actual['skipped'],[]);self.assertEqual(len(actual['brushes']),1)
            self.assertEqual(actual['brushes'][0]['descriptor'],expected.brushes[0]['descriptor'])
            self.assertEqual(actual['brushes'][0]['descriptor']['mypaint']['surfacePolicy'],'krita-legacy-v1')

    def test_bundle_png_and_json_follow_their_own_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);bundle=root/'brushes.bundle'
            with zipfile.ZipFile(bundle,'w') as z:
                z.writestr('paintoppresets/native.myb',self.png_preset())
                z.writestr('paintoppresets/json.myb',json.dumps(self.document()))
                z.writestr('paintoppresets/bad.myb',b'\x89PNG\r\n\x1a\ninvalid')
            c=Catalog(root/'out');convert_krita(bundle,c)
            self.assertEqual(len(c.brushes),2);self.assertEqual(len(c.skipped),1)
            descriptors={b['source']:b['descriptor'] for b in c.brushes}
            self.assertEqual(descriptors['native.myb']['mypaint']['surfacePolicy'],'krita-legacy-v1')
            self.assertEqual(descriptors['json.myb']['version'],55)

    def test_standalone_json_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'brush.myb';path.write_text(json.dumps(self.document()))
            result=self.cli(path,root/'out');self.assertEqual(result.returncode,0,result.stderr)
            manifest=json.loads((root/'out'/'manifest.json').read_text())
            expected=mypaint_preset(path.read_bytes(),path.name,Catalog(root/'direct'))
            self.assertEqual(manifest['brushes'],[expected])

    def test_bundle_raw_json_krita_policy_and_invalid_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);bundle=root/'cases.bundle'
            normal=self.document();paint=self.document(True)
            active=self.document();active['settings']['lock_alpha']={'base_value':1,'inputs':{'pressure':[[0,0],[1,1]]}}
            neutral=self.document();neutral['settings']['lock_alpha']={'base_value':0,'inputs':{'pressure':[]}}
            combined=self.document(True);combined['settings']['lock_alpha']=active['settings']['lock_alpha']
            with zipfile.ZipFile(bundle,'w') as z:
                for name,doc in [('normal',normal),('paint',paint),('active',active),('neutral',neutral),('combined',combined)]:
                    z.writestr('paintoppresets/'+name+'.myb',json.dumps(doc))
                z.writestr('paintoppresets/bad.myb',b'{invalid')
            c=Catalog(root/'out');convert_krita(bundle,c)
            self.assertEqual(len(c.brushes),5);self.assertEqual(len(c.skipped),1)
            records={b['source']:b for b in c.brushes}
            self.assertEqual(records['paint.myb']['descriptor']['mypaint']['surfacePolicy'],'krita-legacy-v1')
            self.assertFalse(any(s['id']==41 for s in records['active.myb']['descriptor']['mypaint']['settings']))
            self.assertTrue(any(s['id']==41 for s in records['neutral.myb']['descriptor']['mypaint']['settings']))
            self.assertEqual(records['combined.myb']['descriptor']['mypaint']['surfacePolicy'],'krita-legacy-v1')
            self.assertFalse(any(s['id']==41 for s in records['combined.myb']['descriptor']['mypaint']['settings']))
            for name,doc in [('normal',normal),('neutral',neutral)]:
                original=mypaint_preset(json.dumps(doc).encode(),name+'.myb',Catalog(root/('direct-'+name)))
                self.assertEqual(records[name+'.myb']['descriptor'],original['descriptor'])
            for record in records.values():validate_portable_profile(record['descriptor'])
            with self.assertRaises(ValueError):
                mypaint_preset(json.dumps(paint).encode(),'standalone.myb',Catalog(root/'standalone'))

    def test_png_without_json_uses_mypaint_defaults_in_bundle_and_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);raw=kpp(engine='mypaintbrush');path=root/'defaults.myb';path.write_bytes(raw)
            result=self.cli(path,root/'standalone');self.assertEqual(result.returncode,0,result.stderr)
            standalone=json.loads((root/'standalone'/'manifest.json').read_text())
            bundle=root/'defaults.bundle'
            with zipfile.ZipFile(bundle,'w') as z:z.writestr('paintoppresets/defaults.myb',raw)
            catalog=Catalog(root/'bundle-out');convert_krita(bundle,catalog)
            self.assertEqual(standalone['skipped'],[]);self.assertEqual(catalog.skipped,[])
            self.assertEqual(standalone['brushes'][0]['descriptor'],catalog.brushes[0]['descriptor'])
            self.assertEqual(catalog.brushes[0]['descriptor']['mypaint']['settings'],[])


if __name__=='__main__':
    unittest.main()
