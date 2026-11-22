"""Canonical false checked flag for native NotCheckable brush controls."""
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from convert import Catalog
from krita_import import convert_krita, _SOURCE_SCOPE
from test_krita_size_strength import authored
from test_sketch_spray194 import native194
from test_child_clock132 import params132, resources132

class CanonicalNotCheckable(unittest.TestCase):
    def load(self, raw, resources=None, bundle=False):
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            root=Path(tmp);path=root/('pair.bundle' if bundle else 'one.kpp')
            if bundle:
                with ZipFile(path,'w') as z:
                    z.writestr('a.kpp',raw)
                    z.writestr('b.kpp',authored({'PressureSize':'true','SizeUseCurve':'true'}))
            else:path.write_bytes(raw)
            catalog=Catalog(root/'out');convert_krita(path,catalog,resources or {})
            self.assertEqual(catalog.skipped,[])
            self.assertEqual(len(catalog.brushes),2 if bundle else 1)
            return catalog.brushes[0]['descriptor']

    def test_pixel_and_child_false_true_missing(self):
        for option in ('Opacity','Flow'):
            for checked in (None,'true','false'):
                for usecurve in (None,'true','false'):
                    values={option+'Sensor':'<params id="pressure"/>'}
                    if usecurve is not None: values[option+'UseCurve']=usecurve
                    if checked is not None: values['Pressure'+option]=checked
                    for child in (False,True):
                        for bundle in (False,True):
                            with self.subTest(option=option,checked=checked,usecurve=usecurve,child=child,bundle=bundle):
                                raw=authored({**params132(),**{'MaskingBrush/Preset/'+k:v for k,v in values.items()}}) if child else authored(values)
                                d=self.load(raw,resources132() if child else None,bundle)
                                if child:d=d['behavior']['dual']['brush']
                                self.assertEqual(d[option.lower()+'ByPressure'],[[0,0],[1,1]] if usecurve!='false' else [[0,1],[1,1]])

    def test_absent_pressure_sensor_and_curve_defaults(self):
        for option in ('Opacity','Flow'):
            for value in (None,'false'):
                values={}
                if value is not None: values['Pressure'+option]=value
                for child in (False,True):
                    raw=authored(values)
                    if child:
                        # Clear the fixture's sensor and UseCurve independently.
                        p={**params132(),**{'MaskingBrush/Preset/'+k:v for k,v in values.items()}}
                        p.pop('MaskingBrush/Preset/'+option+'Sensor',None);p.pop('MaskingBrush/Preset/'+option+'UseCurve',None)
                        if value is None:p.pop('MaskingBrush/Preset/Pressure'+option,None)
                        raw=authored(p)
                    d=self.load(raw,resources132() if child else None)
                    if child:d=d['behavior']['dual']['brush']
                    self.assertEqual(d[option.lower()+'ByPressure'],[[0,0],[1,1]])

    def test_confirmed_engine_opacity_and_tangent_flow(self):
        for engine in ('sketchbrush','spraybrush','deformbrush','colorsmudge','duplicate','tangentnormal'):
            for option in (('Opacity','Flow') if engine=='tangentnormal' else ('Opacity',)):
                for checked in ('true','false'):
                    for usecurve in (None,'true'):
                        values={'Pressure'+option:checked,option+'Sensor':'<params id="pressure"/>'}
                        if usecurve is not None: values[option+'UseCurve']=usecurve
                        if engine=='deformbrush': values['CompositeOp']='copy'
                        with self.subTest(engine=engine,option=option,checked=checked,usecurve=usecurve):
                            d=self.load(native194(engine,params=values))
                            self.assertEqual(d[option.lower()+'ByPressure'],[[0,0],[1,1]])

    def test_scope_resets_after_failure_and_keeps_next_bundle_entry(self):
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            root=Path(tmp);path=root/'pair.bundle'
            with ZipFile(path,'w') as z:
                z.writestr('bad.kpp',authored({'PressureSize':'true','SizeValue':'not-a-number'}))
                z.writestr('good.kpp',native194('sketchbrush',params={'PressureFlow':'false','FlowUseCurve':'true','FlowSensor':'<params id="pressure"/>'}))
            catalog=Catalog(root/'out');convert_krita(path,catalog)
            self.assertEqual(len(catalog.skipped),1)
            self.assertEqual(len(catalog.brushes),1)
            self.assertEqual(catalog.brushes[0]['descriptor']['flowByPressure'],[[0,1],[1,1]])
            self.assertIsNone(_SOURCE_SCOPE.get())

    def test_unrelated_adapters_do_not_gain_sketch_flow(self):
        for engine in ('sketchbrush','spraybrush'):
            for checked in ('true','false'):
                d=self.load(native194(engine,params={'PressureFlow':checked,'FlowUseCurve':'true','FlowSensor':'<params id="pressure"/>'}))
                self.assertEqual(d['flowByPressure'],[[0,1],[1,1]])

if __name__=='__main__':unittest.main()
