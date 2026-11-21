"""Genuine authored native Color Smudge combinations; no descriptor admission bypass."""
import copy,io,base64,json,tempfile,unittest
from pathlib import Path
from PIL import Image
from test_krita import kpp
from krita_import import preset,xml
from native_mask190 import png_preset
from brush_contract import Catalog
from color_smudge193 import scope193,NATIVE_MODES,COMPOSITES
import convert

def native193(*,mode='overlay',modern=True,smudge=0,tip=None,extra=''):
    return kpp(tip or '<Brush type="auto_brush" spacing=".1" density=".8" randomness=".2"><MaskGenerator diameter="16" ratio=".7" type="rect" id="default" hfade=".5" vfade=".7" spikes="5"/></Brush>', '<param name="SmudgeRateUseNewEngine">'+str(modern).lower()+'</param><param name="SmudgeRateMode">'+str(smudge)+'</param><param name="PressureSmudgeRate">true</param><param name="SmudgeRateValue">.5</param><param name="PressureColorRate">true</param><param name="ColorRateValue">.3</param>'+extra, engine='colorsmudge',mode=mode)
class Smudge193Tests(unittest.TestCase):
    def test_embedded_pattern_bytearray_survives_native_bridge(self):
        pattern=io.BytesIO();Image.new('L',(4,4),128).save(pattern,format='PNG')
        encoded=base64.b64encode(base64.b64encode(pattern.getvalue())).decode()
        extra='<param name="Texture/Pattern/Enabled">true</param><param name="Texture/Pattern/PatternFileName">missing.png</param><param name="Texture/Pattern/Pattern" type="bytearray">'+encoded+'</param>'
        with tempfile.TemporaryDirectory() as tmp:
            result=preset(native193(extra=extra),'test.kpp',Catalog(Path(tmp)),{})
            self.assertEqual(result['descriptor']['version'],193)
            self.assertIn('texture',result['descriptor'])
    def test_existing_blends_foreground_only_both_strategies_and_dulling(self):
        with tempfile.TemporaryDirectory()as tmp:
            for modern in(False,True):
                for mode,expected in NATIVE_MODES.items():
                    for dull in(0,1):
                        with self.subTest(modern=modern,mode=mode,dull=dull):
                            c=Catalog(Path(tmp)/(str(modern)+mode+str(dull)));d=preset(native193(mode=mode,modern=modern,smudge=dull),'Own193.kpp',c,{})['descriptor'];self.assertTrue(scope193(d));self.assertEqual(d['mixer']['colorRateComposite'],expected);self.assertEqual(d['behavior']['rendering']['blendMode'],'normal')
                            from color_smudge193 import validate_smudge193_portable
                            validate_smudge193_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
    def test_text_and_lightness_erase(self):
        image=Image.new('RGBA',(2,2));image.putdata([(20,40,60,255),(80,100,120,128),(160,190,220,64),(250,240,230,255)]);out=io.BytesIO();image.save(out,format='PNG');resource='<resources><resource filename="tip.png" type="brushes">'+base64.b64encode(out.getvalue()).decode()+'</resource></resources>'
        with tempfile.TemporaryDirectory()as tmp:
            for label,tip,extra in [('text','<Brush type="kis_text_brush" text="AB" pipe="true" font="DejaVu Sans,12,-1,5,50,0,0,0,0,0" spacing=".1"/>',''),('lightness','<Brush type="png_brush" filename="tip.png" brushApplication="2" spacing=".1"/>',resource)]:
                with self.subTest(label=label):
                    c=Catalog(Path(tmp)/label);d=preset(native193(mode='erase',tip=tip,extra=extra),'Own193.kpp',c,{})['descriptor'];self.assertTrue(scope193(d));self.assertEqual(d['mixer']['colorRateComposite'],'erase')
                    if label=='lightness':self.assertIn('paintThickness',d['mixer'])
    def test_unknown_native_mode_and_composite_reject(self):
        with tempfile.TemporaryDirectory()as tmp:
            for raw in(native193(mode='unknown'),native193(smudge='bad'),native193(smudge=2)):
                with self.assertRaises(ValueError):preset(raw,'bad.kpp',Catalog(Path(tmp)),{})
    def test_all_gih_selectors_geometry_and_pigment_families(self):
        import struct
        def frame(w,h):return struct.pack('>7I',29,2,w,h,4,0x47494d50,25)+b'\0'+bytes([30,80,160,128])*(w*h)
        from color_smudge193 import validate_smudge193_portable
        with tempfile.TemporaryDirectory()as tmp:
            for selection in('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental','dimensions'):
                for app in range(4):
                    for unequal in(False,True):
                        count=4 if selection=='dimensions'else 2
                        header=(str(count)+' ncells:'+str(count)+' dim:2 rank0:2 sel0:angular rank1:2 sel1:pressure'if selection=='dimensions'else'2 ncells:2 dim:1 rank0:2 sel0:'+selection)
                        raw=b'Own193\n'+header.encode()+b'\n'+b''.join(frame(2+i%2 if unequal else 2,2)for i in range(count))
                        resources='<resources><resource filename="tip.gih" type="brushes">'+base64.b64encode(raw).decode()+'</resource></resources>'
                        tip='<Brush type="gbr_brush" filename="tip.gih" brushApplication="'+str(app)+'" spacing=".1"/>'
                        with self.subTest(selection=selection,app=app,unequal=unequal):
                            c=Catalog(Path(tmp)/(selection+str(app)+str(unequal)));d=preset(native193(mode='diff',tip=tip,extra=resources),'Own193.kpp',c,{})['descriptor'];self.assertTrue(scope193(d));a=d['tip'].get('animation');self.assertIsNotNone(a)
                            if unequal:self.assertIn('geometry',a)
                            validate_smudge193_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
    def test_optional_scalar_texture_all_modes_and_projection_gradient(self):
        image=Image.new('RGBA',(2,2),(30,90,160,128));out=io.BytesIO();image.save(out,format='PNG');resource='<resources><resource filename="pattern.png" type="brushes">'+base64.b64encode(out.getvalue()).decode()+'</resource></resources>'
        from color_smudge193 import validate_smudge193_portable
        with tempfile.TemporaryDirectory()as tmp:
            for mode in range(16):
                for modern in(False,True):
                    extra=resource+'<param name="MergedPaint">true</param><param name="PressureGradient">true</param><param name="GradientValue">.4</param><param name="Texture/Pattern/Enabled">true</param><param name="Texture/Pattern/PatternFileName">pattern.png</param><param name="Texture/Pattern/TexturingMode">'+str(mode)+'</param><param name="Texture/Pattern/AutoInvertOnErase">true</param>'
                    with self.subTest(mode=mode,modern=modern):
                        c=Catalog(Path(tmp)/(str(mode)+str(modern)));d=preset(native193(mode='erase',modern=modern,smudge=1,extra=extra),'Own193.kpp',c,{})['descriptor'];self.assertTrue(scope193(d));self.assertEqual(d['mixer']['source'],'projectionCanvas');self.assertIn('gradient',d['mixer']['foreground']);self.assertNotIn('material',d['texture']);self.assertIn('eraseId',d['texture'])
                        validate_smudge193_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
    def test_ignored_pixel_options_and_unknown_option_rejection(self):
        with tempfile.TemporaryDirectory()as tmp:
            extra='<param name="PressureFlow">true</param><param name="FlowValue">.2</param><param name="PressureSoftness">true</param><param name="PressureSharpness">true</param><param name="PressureSize">true</param><param name="SizeSensor"><![CDATA[<params id="rotation"/>]]></param>'
            d=preset(native193(extra=extra),'Own193.kpp',Catalog(Path(tmp)/'ok'),{})['descriptor'];self.assertEqual(d['flow'],1);self.assertNotIn('alphaThreshold',d['tip']);self.assertTrue(scope193(d))
            with self.assertRaises(ValueError):preset(native193(extra='<param name="PressureUnknown193">true</param>'),'bad.kpp',Catalog(Path(tmp)/'bad'),{})
    def test_portable_whole_roundtrip_rejects_foreign_before_publication(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);c=Catalog(root/'native');c.brushes.append(preset(native193(mode='diff',modern=False,smudge=1),'Own193.kpp',c,{}));c.brushes.append(preset(native193(mode='screen',modern=True),'Own193b.kpp',c,{}));env={'library':c.write(),'assets':{a:base64.b64encode((c.output/v['file']).read_bytes()).decode()for a,v in c.assets.items()}};path=root/'Own193.grafetto-brushes.json';path.write_text(json.dumps(env));out=Catalog(root/'portable');convert.portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
            for label in('downgrade','dual','timing','unknownComposite','missingComposite','missingSmear','wrongStage','foreignRoot','badMean','flow','badProfile'):
                bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
                if label=='downgrade':d['version']=191
                elif label in('dual','timing'):d['behavior'][label]={}
                elif label=='unknownComposite':d['mixer']['colorRateComposite']='unknown'
                elif label=='missingComposite':d['mixer'].pop('colorRateComposite')
                elif label=='missingSmear':d['mixer'].pop('smearAlpha')
                elif label=='wrongStage':d['behavior']['rendering']['blendMode']='difference'
                elif label=='foreignRoot':d['unknown']=True
                elif label=='badMean':d['mixer']['sampling']['radius']=float('inf')
                elif label=='flow':d['flow']=.5
                else:d['tip']['profile']['unknown']=True
                path.write_text(json.dumps(bad));out=Catalog(root/label)
                with self.subTest(label=label),self.assertRaises(ValueError):convert.portable_bundle(path,out)
                self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{})
    def test_static_old_whole_records_remain_exact(self):
        import os,importlib.util
        source=os.environ.get('SMUDGE193_BASE_IMPORTER')
        if not source:self.skipTest('Exact pre193 source snapshot required')
        spec=importlib.util.spec_from_file_location('smudge193_old_import',source);old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
        tip='<Brush type="auto_brush" spacing=".1"><MaskGenerator diameter="16" ratio="1" type="circle" id="default" hfade="1" vfade="1" spikes="2"/></Brush>'
        with tempfile.TemporaryDirectory()as tmp:
            for modern,mode,dull in[(False,'normal',0),(False,'normal',1),(False,'multiply',0),(False,'overlay',0),(True,'normal',0),(True,'normal',1),(True,'hard_mix_photoshop',0)]:
                raw=native193(tip=tip,modern=modern,mode=mode,smudge=dull)
                with self.subTest(modern=modern,mode=mode,dull=dull):
                    before=old.preset(raw,'Old.kpp',Catalog(Path(tmp)/('old'+str(modern)+mode+str(dull))),{});after=preset(raw,'Old.kpp',Catalog(Path(tmp)/('new'+str(modern)+mode+str(dull))),{});self.assertEqual(before,after)
    def test_canonical_bank_parity_and_invalid_raw_rates_radius(self):
        import re
        shared=(Path(__file__).resolve().parents[2]/'packages/shared/src/brushBehavior.ts').read_text();modes=re.findall(r"'([^']+)'",re.search(r'BRUSH_BLEND_MODES: readonly BrushBlendMode\[\] = \[(.*?)\]',shared).group(1));self.assertEqual(set(COMPOSITES),{*modes,'dodge','burn','grainMerge','grainExtract','negation','erase','parallel','behind'})
        with tempfile.TemporaryDirectory()as tmp:
            for key,value in [('ColorRateValue','NaN'),('SmudgeRateValue','bad'),('SmudgeRadiusValue','bad'),('SmudgeRadiusValue','NaN'),('SmudgeRadiusValue','301'),('SmudgeRadiusVersion','bad'),('SmudgeRadiusVersion','3')]:
                raw=native193(extra='<param name="'+key+'">'+value+'</param>')
                with self.subTest(key=key,value=value),self.assertRaises(ValueError):preset(raw,'bad.kpp',Catalog(Path(tmp)/str(len(value))),{})
    def test_static_original_geometry_all_pigments_both_aspects_and_portable(self):
        from color_smudge193 import validate_smudge193_portable
        with tempfile.TemporaryDirectory()as tmp:
            for width,height in((3,7),(7,3)):
                for app in range(4):
                    image=Image.new('RGBA',(width,height),(30,80,160,128));out=io.BytesIO();image.save(out,format='PNG');resource='<resources><resource filename="tip.png" type="brushes">'+base64.b64encode(out.getvalue()).decode()+'</resource></resources>'
                    with self.subTest(width=width,height=height,app=app):
                        c=Catalog(Path(tmp)/(str(width)+str(height)+str(app)));tip='<Brush type="png_brush" filename="tip.png" brushApplication="'+str(app)+'" spacing=".1"/>';d=preset(native193(mode='diff',tip=tip,extra=resource),'Geometry.kpp',c,{})['descriptor'];self.assertTrue(scope193(d));self.assertEqual(d['tip']['sourceGeometry'],{'version':1,'width':width,'height':height});self.assertNotIn('animation',d['tip']);self.assertNotIn('imageSampling',d['tip']);self.assertEqual(d['tip']['maskBounds'],{'x':0.,'y':0.,'width':.875,'height':.875});self.assertEqual(d['tip']['aspect'],1)
                        validate_smudge193_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
                        for mutation in('width','unknown','animation','version','round','duplicateSampler'):
                            bad=copy.deepcopy(d)
                            if mutation=='width':bad['tip']['sourceGeometry']['width']=4 if width==3 else 3
                            elif mutation=='unknown':bad['tip']['sourceGeometry']['unknown']=True
                            elif mutation=='animation':bad['tip']['animation']={'mode':'incremental','frames':[bad['tip']['mask']]*2}
                            elif mutation=='version':bad['version']=191
                            elif mutation=='duplicateSampler':bad['tip']['imageSampling']={'kind':'integer-pyramid','signal':'inverse-gray','sourceRect':{'x':0,'y':0,'width':width,'height':height}}
                            else:bad['tip']['kind']='round'
                            with self.subTest(mutation=mutation),self.assertRaises(ValueError):validate_smudge193_portable(bad,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
    def test_normal_static_imports_promote_geometry_but_keep_old_integer_masks(self):
        from color_smudge193 import validate_smudge193_portable
        with tempfile.TemporaryDirectory()as tmp:
            for app in range(4):
                image=Image.new('RGBA',(3,7),(30,80,160,128));out=io.BytesIO();image.save(out,format='PNG');resource='<resources><resource filename="normal.png" type="brushes">'+base64.b64encode(out.getvalue()).decode()+'</resource></resources>'
                c=Catalog(Path(tmp)/str(app));d=preset(native193(mode='normal',tip='<Brush type="png_brush" filename="normal.png" brushApplication="'+str(app)+'" spacing=".1"/>',extra=resource),'Normal.kpp',c,{})['descriptor'];self.assertTrue(scope193(d));self.assertEqual(d['version'],193);self.assertEqual(d['tip']['sourceGeometry'],{'version':1,'width':3,'height':7});self.assertEqual(d['mixer']['colorRateComposite'],'normal');self.assertNotIn('imageSampling',d['tip']);validate_smudge193_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
            image=Image.new('RGB',(3,7),(64,64,64));out=io.BytesIO();image.save(out,format='PNG');resource='<resources><resource filename="opaque.png" type="brushes">'+base64.b64encode(out.getvalue()).decode()+'</resource></resources>';c=Catalog(Path(tmp)/'opaque');raw=native193(mode='normal',tip='<Brush type="png_brush" filename="opaque.png" brushApplication="0" spacing=".1"/>',extra=resource);d=preset(raw,'OldMask.kpp',c,{})['descriptor'];self.assertLess(d['version'],193);self.assertEqual(d['tip']['imageSampling']['sourceRect']['width'],3);self.assertEqual(d['tip']['imageSampling']['sourceRect']['height'],7);self.assertNotIn('sourceGeometry',d['tip'])
