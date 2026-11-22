"""Wash cannot silently discard the masking brush during 194/195 lowering."""
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile
import convert
from krita_import import convert_krita
from test_krita import kpp

class WashMaskGuardTests(unittest.TestCase):
    def test_root_engines_actions_timer_and_bundle(self):
        child='<Brush type="auto_brush"><MaskGenerator type="circle" diameter="16" ratio="1"/></Brush>'
        for engine in ('sketchbrush','spraybrush'):
            for action in ('1','2',None):
                for timer in ('false','true'):
                    for mask in ('false','true','yes'):
                        with self.subTest(engine=engine,action=action,timer=timer,mask=mask), tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                            props=('<param name="PaintOpAction">'+action+'</param>' if action else '')
                            props+='<param name="PaintOpSettings/isAirbrushing">'+timer+'</param><param name="MaskingBrush/Enabled">'+mask+'</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA['+child+']]></param>'
                            raw=kpp(engine=engine,resources=props,implicit_action=action is None)
                            for suffix in ('.kpp','.bundle'):
                                path=Path(tmp)/('sample'+suffix)
                                if suffix=='.bundle':
                                    with ZipFile(path,'w') as z:z.writestr('sample.kpp',raw)
                                else:path.write_bytes(raw)
                                catalog=convert.Catalog(Path(tmp)/('out'+suffix))
                                convert_krita(path,catalog)
                                if action is None:
                                    self.assertIn('Implicit Krita Wash',str(catalog.skipped))
                                elif action=='2' and mask!='false':
                                    self.assertIn('Native Sketch/Spray Wash with masking brush is unsupported',str(catalog.skipped))
                                else:
                                    self.assertEqual(catalog.skipped,[])
                                    self.assertEqual(len(catalog.brushes),1)
