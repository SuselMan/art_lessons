"""Reject ambiguous active curve flags before their controls are dropped."""
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
import convert
from krita_import import convert_krita
from test_krita_size_strength import authored
from test_sketch_spray194 import native194
from test_child_clock132 import params132, resources132

class UseCurveBooleanGuard(unittest.TestCase):
    def exercise(self, tmp, raw, resources=None, bundle=False):
        path=Path(tmp)/('pair.bundle' if bundle else 'one.kpp')
        if bundle:
            with ZipFile(path,'w') as archive:
                archive.writestr('bad.kpp',raw)
                archive.writestr('good.kpp',authored({'PressureSize':'true','SizeUseCurve':'true'}))
        else:
            path.write_bytes(raw)
        catalog=convert.Catalog(Path(tmp)/'out')
        convert_krita(path,catalog,resources or {})
        return catalog

    def test_public_options_and_bundle(self):
        families=(
            ('SizeUseCurve',lambda v: authored({'PressureSize':'true','SizeUseCurve':v,'SizeSensor':'<params id="pressure"/>'}),{}),
            ('Line widthUseCurve',lambda v: native194(params={'PressureLine width':'true','Line widthUseCurve':v,'Line widthSensor':'<params id="pressure"/>'}),{}),
            ('MaskingBrush/Preset/SizeUseCurve',lambda v: authored({**params132(),'MaskingBrush/Preset/SizeUseCurve':v,'MaskingBrush/Preset/SizeSensor':'<params id="pressure"/>'}),resources132()),
        )
        for field,make,resources in families:
            for value in ('true','false','yes','no','malformed',''):
                for bundle in (False,True):
                    with self.subTest(field=field,value=value,bundle=bundle),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                        result=self.exercise(tmp,make(value),resources,bundle)
                        if value in ('true','false'):
                            self.assertEqual(result.skipped,[])
                            self.assertEqual(len(result.brushes),2 if bundle else 1)
                        else:
                            self.assertIn('Unsupported noncanonical '+field,str(result.skipped))
                            self.assertEqual(len(result.brushes),1 if bundle else 0)

    def test_inactive_controls_do_not_cause_rejection(self):
        child={**params132(),'MaskingBrush/Preset/SizeUseCurve':'yes','MaskingBrush/Preset/PressureSize':'false'}
        cases=(authored({'PressureSize':'false','SizeUseCurve':'yes'}),
               native194(params={'PressureLine width':'false','Line widthUseCurve':'yes'}),
               authored(child),
               authored({**child,'MaskingBrush/Enabled':'false','MaskingBrush/Preset/PressureSize':'true'}),
               authored({**child,'PaintOpAction':'1','MaskingBrush/Preset/PressureSize':'true'}))
        for raw in cases:
            with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                result=self.exercise(tmp,raw,resources132())
                self.assertNotIn('Unsupported noncanonical',str(result.skipped))
                self.assertEqual(len(result.brushes),1)

if __name__=='__main__':unittest.main()
