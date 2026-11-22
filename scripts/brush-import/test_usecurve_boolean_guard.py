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
from test_tangent_wash136 import authored as tangent_authored

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
            ('OpacityUseCurve',lambda v: authored({'PressureOpacity':'true','OpacityUseCurve':v,'OpacitySensor':'<params id="pressure"/>'}),{}),
            ('FlowUseCurve',lambda v: authored({'PressureFlow':'true','FlowUseCurve':v,'FlowSensor':'<params id="pressure"/>'}),{}),
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

    def test_not_checkable_source_pixel_and_children(self):
        for option in ('Opacity','Flow'):
            for checked in (None,'true','false'):
                for flag in (None,'true','false','yes'):
                    for child in (False,True):
                        values={option+'Sensor':'<params id="pressure"/>'}
                        if checked is not None: values['Pressure'+option]=checked
                        if flag is not None: values[option+'UseCurve']=flag
                        raw=authored({**params132(),**{'MaskingBrush/Preset/'+k:v for k,v in values.items()}}) if child else authored(values)
                        with self.subTest(option=option,checked=checked,flag=flag,child=child),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                            result=self.exercise(tmp,raw,resources132())
                            if flag=='yes':
                                self.assertIn('Unsupported noncanonical',str(result.skipped));continue
                            self.assertEqual(result.skipped,[])
                            desc=result.brushes[0]['descriptor']
                            if child: desc=desc['behavior']['dual']['brush']
                            curve=desc[option.lower()+'ByPressure']
                            self.assertEqual(curve, [[0,1],[1,1]] if flag=='false' else [[0,0],[1,1]])

    def test_child_guard_for_present_non_buildup_actions(self):
        for action in ('0','2','3','02','-1','invalid','1',None):
            values={**params132(),'MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeUseCurve':'yes'}
            if action is None: values.pop('PaintOpAction',None)
            else: values['PaintOpAction']=action
            with self.subTest(action=action),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                result=self.exercise(tmp,authored(values),resources132())
                if action not in ('1',None): self.assertIn('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve',str(result.skipped))
                else: self.assertNotIn('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve',str(result.skipped))

    def test_tangent_flow_buildup_and_wash_pressure_guard(self):
        for action in ('1','2'):
            for flag in ('true','false','yes'):
                for checked in (None,'false','true'):
                    values={'PaintOpAction':action,'FlowUseCurve':flag,'FlowSensor':'<params id="pressure"/>'}
                    if checked is not None: values['PressureFlow']=checked
                    with self.subTest(action=action,flag=flag,checked=checked),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                        result=self.exercise(tmp,tangent_authored(action,values))
                        if flag=='yes': self.assertIn('Unsupported noncanonical FlowUseCurve',str(result.skipped))
                        elif action=='2' and flag=='true': self.assertIn('Tangent Wash Flow requires a new renderer',str(result.skipped))
                        else:
                            self.assertEqual(result.skipped,[])
                            self.assertEqual(result.brushes[0]['descriptor']['flowByPressure'],[[0,0],[1,1]] if flag=='true' else [[0,1],[1,1]])

    def test_tangent_wash_rejects_nonneutral_flow_and_keeps_neighbor(self):
        for extra in ({'FlowUseCurve':'false','FlowValue':'.4'},
                      {'FlowUseCurve':'true','FlowValue':'1'},
                      {'FlowUseCurve':'yes','FlowValue':'1'},
                      {'FlowUseCurve':'false','FlowValue':'1_0e-1'}):
            with self.subTest(extra=extra),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                result=self.exercise(tmp,tangent_authored('2',extra),bundle=True)
                self.assertEqual(len(result.skipped),1)
                self.assertEqual(len(result.brushes),1)
                self.assertTrue(any(x in str(result.skipped) for x in ('Tangent Wash Flow requires a new renderer','Unsupported noncanonical FlowUseCurve')))

    def test_other_confirmed_opacity_consumers(self):
        for engine in ('deformbrush','colorsmudge','duplicate','tangentnormal'):
            for flag in ('true','false','yes'):
                values={'PressureOpacity':'false','OpacityUseCurve':flag,'OpacitySensor':'<params id="pressure"/>'}
                if engine=='deformbrush': values['CompositeOp']='copy'
                with self.subTest(engine=engine,flag=flag),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                    result=self.exercise(tmp,native194(engine,params=values))
                    if flag=='yes':
                        self.assertIn('Unsupported noncanonical OpacityUseCurve',str(result.skipped));continue
                    self.assertEqual(result.skipped,[])
                    self.assertEqual(result.brushes[0]['descriptor']['opacityByPressure'],[[0,0],[1,1]] if flag=='true' else [[0,1],[1,1]])

    def test_opacity_on_sketch_and_spray_and_ignored_flow(self):
        for engine in ('sketchbrush','spraybrush'):
            for option in ('Opacity','Flow'):
                for checked in (None,'false','true'):
                    values={option+'UseCurve':'true',option+'Sensor':'<params id="pressure"/>'}
                    if checked is not None: values['Pressure'+option]=checked
                    with self.subTest(engine=engine,option=option,checked=checked),tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                        result=self.exercise(tmp,native194(engine,params=values))
                        self.assertEqual(result.skipped,[])
                        curve=result.brushes[0]['descriptor'][option.lower()+'ByPressure']
                        self.assertEqual(curve,[[0,0],[1,1]] if option=='Opacity' else [[0,1],[1,1]])

if __name__=='__main__':unittest.main()
