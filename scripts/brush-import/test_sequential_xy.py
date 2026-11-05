"""Opt-in readiness only: no catalog activation or engine parity assertions."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import convert
from krita_import import convert_krita
from sequential_xy import compatible,validate_policy
from test_krita_size_strength import authored

POLICY={'version':1,'kind':'qt5Taus88','policy':'scatterXY'}
PARAMS={'brush_definition':'<Brush type="auto_brush" density="1" randomness="0"><MaskGenerator id="gauss" type="circle" diameter="60" ratio="1" spikes="2" hfade="1" vfade="1" antialiasEdges="0"/></Brush>',
        'PressureScatter':'true','ScatterUseCurve':'false','ScatterValue':'.3','Scattering/AxisX':'true','Scattering/AxisY':'true'}

class SequentialXYTests(unittest.TestCase):
    def brush(self,params=None,*,opt_in=False):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'Authored.kpp';p.write_bytes(authored(params or PARAMS));c=convert.Catalog(Path(tmp)/'out')
            convert_krita(p,c,sequential_xy=opt_in);self.assertEqual(c.skipped,[]);return c.brushes[0]
    def test_default_is_immutable_and_opt_in_changes_only_identity_version_and_policy(self):
        old=self.brush();explicit_off=self.brush(opt_in=False);new=self.brush(opt_in=True)
        self.assertEqual(old,explicit_off);self.assertTrue(compatible(old['descriptor']))
        self.assertEqual(new['descriptor']['version'],33)
        self.assertEqual(new['descriptor']['behavior']['sequentialRandom'],POLICY)
        self.assertNotEqual(old['descriptor']['id'],new['descriptor']['id'])
        normalized=copy.deepcopy(new);normalized['descriptor'].pop('id');normalized['descriptor'].pop('version');normalized['descriptor']['behavior'].pop('sequentialRandom')
        original=copy.deepcopy(old);original['descriptor'].pop('id');original['descriptor'].pop('version')
        self.assertEqual(normalized,original)
    def test_ineligible_presets_stay_unchanged_even_with_explicit_opt_in(self):
        for patch in [{'Scattering/AxisY':'false'}, {'Scattering/AxisX':'false'}, {'PressureScatter':'false'},
                      {'brush_definition':PARAMS['brush_definition'].replace('antialiasEdges="0"','antialiasEdges="1"')},
                      {'brush_definition':PARAMS['brush_definition'].replace('ratio="1"','ratio=".5"')},
                      {'PressureRotation':'true','RotationSensor':'<params id="fuzzy"/>'}]:
            params={**PARAMS,**patch};self.assertEqual(self.brush(params),self.brush(params,opt_in=True))
    def test_child_never_gets_a_sequential_policy_and_dual_parent_is_ineligible(self):
        p={**PARAMS,'MaskingBrush/Enabled':'true'}
        p.update({'MaskingBrush/Preset/'+key:value for key,value in PARAMS.items()})
        old=self.brush(p);new=self.brush(p,opt_in=True)
        self.assertEqual(old,new);self.assertFalse(compatible(new['descriptor']))
        self.assertNotIn('sequentialRandom',new['descriptor']['behavior']['dual']['brush']['behavior'])
    def test_consumer_family_gates_reject_each_other_random_or_effect_path(self):
        source=self.brush()['descriptor']
        mutations=[lambda d:d.update(model='mixer'),lambda d:d.update(texture={}),lambda d:d.update(wet={}),lambda d:d.update(paperInteraction=.1),
                   lambda d:d['behavior'].update(erase=True),lambda d:d['behavior'].update(falloff=0),
                   lambda d:d['behavior'].update(grain={}),lambda d:d['behavior'].update(colorAdjustment={}),lambda d:d['behavior'].update(edgeBleed={}),
                   lambda d:d['tip'].update(animation={}),lambda d:d['tip'].update(alphaThreshold={}),lambda d:d['tip']['profile'].update(antialias=True),
                   lambda d:d['scatter'].update(count=2),lambda d:d['scatter'].update(sizeJitter=.1),lambda d:d['scatter'].update(angleJitter=.1),
                   lambda d:d['behavior']['scatter'].update(countJitter=.1),lambda d:d['behavior']['scatter'].update(roundnessJitter=.1),
                   lambda d:d['behavior'].update(rotation={'random':'stroke'}),lambda d:d['behavior'].update(rotation={'random':'none','composition':{}}),
                   lambda d:d['behavior'].update(dynamics={'size':{'control':'pressure','jitter':0}}),
                   lambda d:d['behavior'].update(modulations={'scatter':[{'control':'random','jitter':0}]}),
                   lambda d:d['behavior'].update(modulations={'flow':[{'control':'strokeRandom','jitter':0}]}),
                   lambda d:d['behavior']['spacing'].update(dynamics=[{'control':'speed','jitter':0}])]
        for mutate in mutations:
            d=copy.deepcopy(source);mutate(d);self.assertFalse(compatible(d));d['behavior']['sequentialRandom']=POLICY
            with self.assertRaises(ValueError):validate_policy(d)
    def test_nonrandom_supported_sensor_targets_and_pressure_spacing_remain_eligible(self):
        d=self.brush()['descriptor'];d['behavior'].update(modulations={'scatter':[{'control':'pressure','minimum':0,'jitter':0}]})
        d['behavior']['spacing']['dynamics']=[{'control':'pressure','minimum':0,'jitter':0}]
        self.assertTrue(compatible(d))
    def test_portable_policy_is_strict_and_atomic_and_no_independent_child_policy(self):
        brush=self.brush(opt_in=True)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'bundle.grafetto-brushes.json'
            envelope={'library':{'schemaVersion':1,'brushes':[brush],'assets':[],'skipped':[]},'assets':{}}
            path.write_text(json.dumps(envelope));convert.portable_bundle(path,convert.Catalog(root/'valid'))
            for i,patch in enumerate([{'version':True},{'version':2},{'kind':'other'},{'policy':'other'},{'extra':1}]):
                bad=copy.deepcopy(envelope);bad['library']['brushes'][0]['descriptor']['behavior']['sequentialRandom'].update(patch)
                path.write_text(json.dumps(bad));catalog=convert.Catalog(root/str(i))
                with self.assertRaises(ValueError):convert.portable_bundle(path,catalog)
                self.assertEqual(list(catalog.output.iterdir()),[])
            with self.assertRaises(ValueError):validate_policy(brush['descriptor'],depth=1)
    def test_opt_in_requires_explicit_boolean(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):convert_krita(Path(tmp)/'missing.kpp',convert.Catalog(Path(tmp)/'out'),sequential_xy='false')

if __name__=='__main__':unittest.main()
