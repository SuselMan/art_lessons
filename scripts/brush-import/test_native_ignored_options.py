"""Genuine authored KPP/GBR; only native-unused options are normalized away."""
from pathlib import Path
import tempfile,unittest,struct,json,hashlib,copy
import xml.etree.ElementTree as ET
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from native_ignored_options import(IGNORED_MIRROR_KEYS,IGNORED_ROTATION_KEYS,strip_unused_native_flow,strip_unused_native_mirror,strip_unused_native_rotation)

def params(values):return''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in values.items())
def converted(family,values=None):
    engine={'bristle':'hairybrush','hatching':'hatchingbrush','sketch-simple':'sketchbrush','sketch-mask':'sketchbrush','curve':'curvebrush'}[family]
    definition='<Brush type="gbr_brush" filename="authored.gbr" scale="1" angle="0" ColorAsMask="1"/>'
    setup={'Sketch/simpleMode':'true'}if family=='sketch-simple'else{}
    raw=kpp(definition,engine=engine,resources=params({**setup,**(values or {})}))
    name=b'qa\0';mask=struct.pack('>7I',28+len(name),2,4,4,1,0x47494d50,25)+name+bytes([255,255,0,0,255,128,0,0,0,0,64,0,0,0,255,255])
    with tempfile.TemporaryDirectory()as directory:
        c=Catalog(Path(directory));result=preset(raw,'authored.kpp',c,{'authored.gbr':mask});assets={key:((c.output/a['file']).read_bytes(),dict(a))for key,a in c.assets.items()}
        return result,raw,assets

def rendering(result):return{k:v for k,v in result['descriptor'].items()if k!='id'}
def active_rotation():return{'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>','RotationValue':'1','RotationcurveMode':'0'}

class NativeIgnoredOptionsTests(unittest.TestCase):
    def assert_original_identity(self,result,raw):
        identity={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(raw).hexdigest(),'rendering':rendering(result)}
        expected='imported-'+hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24]
        self.assertEqual(result['descriptor']['id'],expected)
    def test_native_unused_mirror_all_axes_and_values_preserve_rendering_source_and_opacity(self):
        opacity={'PressureOpacity':'true','OpacityUseCurve':'false','OpacityValue':'.25'}
        for family in['sketch-simple','sketch-mask','bristle','curve']:
            base,base_raw,assets=converted(family,opacity)
            for horizontal,vertical in[('true','false'),('false','true'),('true','true')]:
                for value in['0','.25','.75','1','not a finite native value']:
                    with self.subTest(family=family,horizontal=horizontal,vertical=vertical,value=value):
                        values={**opacity,'PressureMirror':'true','HorizontalMirrorEnabled':horizontal,'VerticalMirrorEnabled':vertical,'MirrorValue':value,'MirrorUseCurve':'true','MirrorSensor':'malformed unused XML','MirrorcurveMode':'invalid'}
                        result,raw,actual_assets=converted(family,values)
                        self.assertEqual(rendering(result),rendering(base));self.assertEqual(result['sourceDefaults'],base['sourceDefaults']);self.assertEqual(actual_assets,assets);self.assertEqual(result['warnings'],base['warnings']);self.assertEqual(result['descriptor']['opacity'],.25)
                        self.assertNotEqual(raw,base_raw);self.assertNotEqual(result['descriptor']['id'],base['descriptor']['id']);self.assert_original_identity(result,raw)
                        self.assertTrue(any(n['feature']=='ignoredNativeMirror'and n['status']=='supported'for n in result['compatibility']))
                        self.assertFalse(any('Mirror'in n.get('detail','')and n['status']=='unsupported'for n in result['compatibility']))
    def test_unused_rotation_stale_sensor_and_checked_constant_do_not_reach_common_parser(self):
        for family in['sketch-simple','curve','hatching']:
            base,_,assets=converted(family)
            for values in[active_rotation(),{'PressureRotation':'true','RotationUseCurve':'false'},{'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':'bad unused XML','RotationValue':'NaN','RotationcurveMode':'999'}]:
                with self.subTest(family=family,values=values):
                    result,raw,actual_assets=converted(family,values);self.assertEqual(rendering(result),rendering(base));self.assertEqual(result['sourceDefaults'],base['sourceDefaults']);self.assertEqual(actual_assets,assets);self.assertEqual(result['warnings'],base['warnings']);self.assert_original_identity(result,raw)
                    self.assertTrue(any(n['feature']=='ignoredNativeRotation'for n in result['compatibility']))
    def test_hatching94_mirror_and_family_angle_are_kept_while_generic_rotation_is_ignored(self):
        real={'PressureMirror':'true','HorizontalMirrorEnabled':'true','VerticalMirrorEnabled':'false','MirrorUseCurve':'false','MirrorValue':'.75','PressureAngle':'true','AngleUseCurve':'false','AngleValue':'.25','Hatching/angle':'-31'}
        base,_,_=converted('hatching',real);extra={**real,'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':'bad unused XML'};result,raw,_=converted('hatching',extra)
        self.assertEqual(rendering(result),rendering(base));self.assertEqual(result['descriptor']['version'],94);self.assertEqual(result['descriptor']['behavior']['mirror'],{'horizontal':True,'vertical':False,'value':.75});self.assertEqual(result['descriptor']['hatching']['angle'],-31)
        self.assertIn('angle',result['descriptor']['hatching']['dynamics']);self.assert_original_identity(result,raw)
    def test_bristle_and_mask101_rotation_remain_active_and_invalid_active_sensor_still_rejects(self):
        for family in['bristle','sketch-mask']:
            base,_,_=converted(family);active,raw,_=converted(family,active_rotation())
            self.assertNotEqual(rendering(active),rendering(base));self.assertTrue('rotation'in active['descriptor']['behavior']or'angle'in active['descriptor']['behavior'].get('dynamics',{}));self.assertFalse(any(n['feature']=='ignoredNativeRotation'for n in active['compatibility']));self.assert_original_identity(active,raw)
            with self.subTest(family=family),self.assertRaises(ET.ParseError):converted(family,{'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':'bad ACTIVE XML'})
    def test_exact_groups_no_wildcard_no_input_mutation_and_no_angle_or_flow_leak(self):
        keys=list(sorted(IGNORED_MIRROR_KEYS|IGNORED_ROTATION_KEYS))+['PressureAngle','AngleValue','Hatching/angle','MirrorFuture','RotationFuture','MirrorFuzzyStroke','brush_definition','FlowValue']
        root=ET.Element('Preset')
        for key in keys:ET.SubElement(root,'param',name=key).text='unused'
        original=ET.tostring(root);private=copy.deepcopy(root);self.assertTrue(strip_unused_native_mirror(private));self.assertTrue(strip_unused_native_rotation(private));self.assertEqual(ET.tostring(root),original)
        self.assertEqual({n.get('name')for n in private},set(keys)-(IGNORED_MIRROR_KEYS|IGNORED_ROTATION_KEYS));self.assertEqual(len(IGNORED_MIRROR_KEYS),11);self.assertEqual(len(IGNORED_ROTATION_KEYS),9)
    def test_flow94_meaningful_classification_unchanged_for_exact_old_key_matrix(self):
        # Independent old94 condition, including boolean/empty/custom and non-param nodes.
        keys=['FlowValue','PressureFlow','FlowUseCurve','FlowSensor','FlowcurveMode','CurveFlow','CustomFlow','FlowcommonCurve','FlowUseSameCurve','FlowFuzzyStroke']
        for key in keys:
            for value in['','false','0','1','1.0',' TRUE ','.25','<bad xml>']:
                root=ET.Element('Preset');ET.SubElement(root,'param',name=key).text=value;ET.SubElement(root,'keep',name=key).text=value
                text=value.strip().lower();baseline=(key=='FlowValue'and text in('1','1.0'))or(key in('PressureFlow','FlowUseCurve','CustomFlow','FlowFuzzyStroke')and text in('false','0'))
                self.assertEqual(strip_unused_native_flow(root),not baseline);self.assertEqual([n.tag for n in root],['keep'])
