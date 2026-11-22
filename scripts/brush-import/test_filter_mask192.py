"""Authored native Filter KPP/CAS, expanded forms and strict portable gates."""
import base64,copy,io,json,struct,tempfile,unittest
from pathlib import Path
from PIL import Image
from test_krita import kpp
from krita_import import preset,convert_krita
from brush_contract import Catalog
from filter_mask192 import image_coverage192,scope192,validate_filter192_portable
import convert

def fixtures192():
    def png(image):
        out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
    def embed(filename,raw):return '<resources><resource filename="'+filename+'" type="brushes">'+base64.b64encode(raw).decode()+'</resource></resources>'
    def frame(w,h,channel=1):
        raw=bytes(([16,80,200,128]* (w*h))if channel==4 else ([0,64,192,255]*((w*h+3)//4))[:w*h])
        return struct.pack('>7I',29,2,w,h,channel,0x47494d50,25)+b'\0'+raw
    def case(label,definition,resources='',kind='invert',smudge=True,mode='multiply'):
        return label,kpp(definition,'<param name="Filter/id">'+kind+'</param><param name="Filter/smudgeMode">'+str(smudge).lower()+'</param>'+resources,engine='filter',mode=mode)
    rows=[]
    for i,(profile,shape)in enumerate([('default','rect'),('gauss','circle'),('soft','circle')]):
        definition='<Brush type="auto_brush" spacing="0.1" density=".8" randomness=".2"><MaskGenerator diameter="16" type="'+shape+'" ratio=".6" hfade=".5" vfade=".7" id="'+profile+'" spikes="2" softness_curve="0,0;1,1" antialiasEdges="1"/></Brush>'
        rows.append(case(profile,definition,kind=['invert','gaussian blur','unsharp'][i],smudge=i!=1))
    rows.append(case('spikes','<Brush type="auto_brush" spacing=".1"><MaskGenerator diameter="16" type="circle" ratio=".6" hfade=".6" vfade=".5" id="default" spikes="5"/></Brush>',kind='desaturate'))
    rows.append(case('text','<Brush type="kis_text_brush" text="AB" font="DejaVu Sans,12,-1,5,50,0,0,0,0,0" pipe="true" spacing=".1"/>',kind='posterize'))
    image=Image.new('RGBA',(2,2));image.putdata([(255,0,0,128),(0,255,0,128),(0,0,255,255),(255,255,255,64)])
    rows.append(case('image','<Brush type="png_brush" filename="tip.png" brushApplication="1" spacing=".1"/>',embed('tip.png',png(image))))
    for i,mode in enumerate(('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental')):
        raw=('Own Filter192\n2 ncells:2 dim:1 rank0:2 sel0:'+mode+'\n').encode()+frame(2,2,4)+frame(3,2,4)
        rows.append(case('pipe-'+mode,'<Brush type="gbr_brush" filename="tip.gih" brushApplication="1" spacing=".1"/>',embed('tip.gih',raw),kind=['invert','desaturate','posterize','gaussian blur','unsharp'][i%5],smudge=i%2==0))
    pattern=png(Image.new('RGBA',(2,2),(60,120,200,128)))
    for mode in(3,12):
        extra=embed('pattern.png',pattern)+'<param name="Texture/Pattern/Enabled">true</param><param name="Texture/Pattern/PatternFileName">pattern.png</param><param name="Texture/Pattern/TexturingMode">'+str(mode)+'</param>'
        rows.append(case('texture-'+str(mode),'<Brush type="auto_brush" spacing=".1"><MaskGenerator diameter="16" type="rect" ratio=".5" hfade=".5" vfade=".5" id="default"/></Brush>',extra,mode='erase'if mode==12 else'copy'))
    # The same library carries both feedback laws for every existing kernel.
    rows.append(case('gaussian-true','<Brush type="auto_brush" spacing=".1"><MaskGenerator diameter="16" type="circle" ratio=".6" hfade=".5" vfade=".7" id="gauss" spikes="2"/></Brush>',kind='gaussian blur',smudge=True))
    rows.append(case('unsharp-false','<Brush type="auto_brush" spacing=".1"><MaskGenerator diameter="16" type="rect" ratio=".6" hfade=".5" vfade=".7" id="default" spikes="2"/></Brush>',kind='unsharp',smudge=False))
    for label,profile,shape,curve in [('soft-circle-AA-compound','soft','circle','0,0;.2,.1;.65,.9;1,1'),('gaussian-rectangle-AA-compound','gauss','rect','0,0;1,1')]:
        definition='<Brush type="auto_brush" spacing=".1" density=".7" randomness=".3"><MaskGenerator diameter="24" type="'+shape+'" ratio=".6" hfade=".4" vfade=".7" id="'+profile+'" spikes="5" antialiasEdges="1" softness_curve="'+curve+'"/></Brush>'
        rows.append(case(label,definition,kind='invert',smudge=True))
    return rows

class Filter192Tests(unittest.TestCase):
    def test_hard_circular_blur_radius_10(self):
        config='<filterconfig><param name="halfWidth">10</param><param name="halfHeight">10</param><param name="shape">0</param><param name="strength">100</param><param name="rotate">0</param></filterconfig>'
        with tempfile.TemporaryDirectory() as tmp:
            result=preset(kpp(resources='<param name="Filter/id">blur</param>'+config,engine='filter'),'blur.kpp',Catalog(Path(tmp)/'native'),{})
            descriptor=result['descriptor'];self.assertTrue(scope192(descriptor));self.assertEqual(descriptor['filter']['kind'],'hardBlur')
            bad=copy.deepcopy(descriptor);bad['filter']['radiusX']=11;bad['filter']['radiusY']=11;self.assertFalse(scope192(bad))
    def test_default_gray_law(self):
        image=Image.new('RGBA',(4,1));image.putdata([(255,0,0,255),(0,255,0,255),(0,0,255,255),(255,255,255,128)])
        self.assertEqual(image_coverage192(image).tobytes(),bytes([127,220,76,128]))
    def test_genuine_whole_library_and_portable(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);catalog=Catalog(root/'native')
            for label,data in fixtures192():
                path=root/(label+'.kpp');path.write_bytes(data);convert_krita(path,catalog,{})
            self.assertEqual(catalog.skipped,[])
            self.assertEqual(len(catalog.brushes),len(fixtures192()))
            self.assertEqual({(b['descriptor']['filter']['kind'],b['descriptor']['filter']['smudgeMode'])for b in catalog.brushes},{(kind,mode)for kind in('invert','desaturate','posterize','gaussian','unsharp')for mode in(False,True)})
            for b in catalog.brushes:self.assertTrue(scope192(b['descriptor']),b['name'])
            env={'library':catalog.write(),'assets':{aid:base64.b64encode((catalog.output/a['file']).read_bytes()).decode()for aid,a in catalog.assets.items()}}
            path=root/'native.grafetto-brushes.json';path.write_text(json.dumps(env));out=Catalog(root/'portable');convert.portable_bundle(path,out);self.assertEqual(out.brushes,catalog.brushes)
            for mutation in('rgb','dual','flow','policy','source','composite','opacity','foreign'):
                bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
                if mutation=='rgb':d['tip']['color']={}
                elif mutation=='dual':d['behavior']['dual']={}
                elif mutation=='flow':d['flow']=.5
                elif mutation=='opacity':d['opacityByPressure']=[[0,0],[1,1]]
                elif mutation=='foreign':d['foreign']=True
                else:d['filter'][{'policy':'maskPolicy','source':'sourcePolicy','composite':'composite'}[mutation]]='wrong'
                path.write_text(json.dumps(bad))
                with self.subTest(mutation=mutation),self.assertRaises(ValueError):convert.portable_bundle(path,Catalog(root/mutation))
    def test_soft_blur_radius_and_scope(self):
        config='<filterconfig><param name="halfWidth">41</param><param name="halfHeight">41</param><param name="shape">0</param><param name="strength">0</param><param name="rotate">0</param></filterconfig>'
        with tempfile.TemporaryDirectory() as tmp:
            def read(value):return preset(kpp(resources='<param name="Filter/id">blur</param>'+value,engine='filter'),'blur.kpp',Catalog(Path(tmp)/str(len(value))),{})
            result=read(config);d=result['descriptor'];self.assertTrue(scope192(d));self.assertEqual(d['filter']['radiusX'],41);self.assertTrue(any(x['feature']=='softBlurFilter' and x['status']=='approximate' for x in result['compatibility']))
            for bad in (config.replace('>41<','>65<'),config.replace('name="shape">0','name="shape">1')):
                with self.assertRaises(ValueError):read(bad)
    def test_noise_seeds_and_bounds(self):
        config='<filterconfig><param name="level">50</param><param name="opacity">50</param><param name="seedThreshold">1</param><param name="seedRed">2</param><param name="seedGreen">3</param><param name="seedBlue">4</param></filterconfig>'
        with tempfile.TemporaryDirectory() as tmp:
            def read(value):return preset(kpp(resources='<param name="Filter/id">noise</param>'+value,engine='filter'),'noise.kpp',Catalog(Path(tmp)/str(len(value))),{})
            result=read(config);d=result['descriptor'];self.assertTrue(scope192(d));self.assertEqual(d['filter']['seeds'],[1,2,3,4]);self.assertTrue(any(x['feature']=='noiseFilter' and x['status']=='approximate' for x in result['compatibility']))
            for bad in (config.replace('>50<','>101<'),config.replace('seedRed','unknownSeed')):
                with self.assertRaises(ValueError):read(bad)
    def test_hsv_saturation_native_mode_and_rejections(self):
        config='<filterconfig><param name="type">0</param><param name="h">0</param><param name="s">50</param><param name="v">0</param><param name="colorize">false</param><param name="compatibilityMode">false</param></filterconfig>'
        with tempfile.TemporaryDirectory() as tmp:
            def read(value):return preset(kpp(resources='<param name="Filter/id">hsvadjustment</param>'+value,engine='filter'),'hsv.kpp',Catalog(Path(tmp)/str(len(value))),{})
            d=read(config)['descriptor'];self.assertTrue(scope192(d));self.assertEqual(d['filter']['amount'],.5)
            for bad in (config.replace('50','101'),config.replace('false','true'),config.replace('name="type">0','name="type">1')):
                with self.assertRaises(ValueError):read(bad)
    def test_color_balance_preserves_native_channels_and_is_bounded(self):
        config='<filterconfig version="0"><param name="cyan_red_shadows">-60</param><param name="magenta_green_highlights">60</param><param name="preserve_luminosity">false</param></filterconfig>'
        extra='<param name="Filter/id">colorbalance</param>'+config
        with tempfile.TemporaryDirectory() as tmp:
            c=Catalog(Path(tmp)/'ok');result=preset(kpp(resources=extra,engine='filter'),'authored.kpp',c,{})
            d=result['descriptor'];self.assertTrue(scope192(d));f=d['filter']
            self.assertEqual(f['kind'],'colorBalance');self.assertEqual(f['shadows'],[-.6,0,0]);self.assertEqual(f['highlights'],[0,.6,0]);self.assertFalse(f['preserveLuminosity'])
            validate_filter192_portable(d,{k:v['size']for k,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
            for bad_config in (config.replace('-60','-101'),config.replace('false','maybe')):
                with self.assertRaises(ValueError):preset(kpp(resources='<param name="Filter/id">colorbalance</param>'+bad_config,engine='filter'),'bad.kpp',Catalog(Path(tmp)/('bad'+str(len(bad_config)))),{})
    def test_color_balance_ignores_krita_factory_typo_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            def read(fields):
                config='<filterconfig>'+''.join('<param name="'+k+'">'+v+'</param>' for k,v in fields)+'</filterconfig>'
                return preset(kpp(resources='<param name="Filter/id">colorbalance</param>'+config,engine='filter'),'balance.kpp',Catalog(Path(tmp)/str(len(fields))),{})['descriptor']['filter']
            ignored=[(axis+'_'+tone,'37') for tone in ('shadows','midtones','highlights') for axis in ('yellow_green','magenta_blue')]
            active=[('cyan_red_shadows','-60'),('magenta_green_shadows','40'),('yellow_blue_highlights','25'),('preserve_luminosity','false')]
            self.assertEqual(read(ignored),read([]))
            self.assertEqual(read(ignored+active),read(active))
            f=read(ignored+active)
            self.assertEqual(f['shadows'],[-.6,.4,0]);self.assertEqual(f['highlights'],[0,0,.25]);self.assertFalse(f['preserveLuminosity'])
            with self.assertRaisesRegex(ValueError,'Unknown Color Balance setting'):
                read(ignored+[('yellow_green_unknown','0')])

    def test_native_filterconfig_retains_authored_unsharp_parameters(self):
        definition='<Brush type="auto_brush" randomness=".6"><MaskGenerator type="circle" ratio="1" diameter="16" id="soft" softness_curve="0,1;1,0;" antialiasEdges="0"/></Brush>'
        extra='<param name="Filter/id">unsharp</param><filterconfig version="1"><param name="amount">2</param><param name="halfSize">4</param><param name="lightnessOnly">true</param><param name="threshold">0</param></filterconfig>'
        with tempfile.TemporaryDirectory() as tmp:
            result=preset(kpp(definition,extra,engine='filter'),'authored.kpp',Catalog(Path(tmp)),{})
        f=result['descriptor']['filter'];self.assertTrue(scope192(result['descriptor']))
        self.assertEqual((f['radiusX'],f['radiusY'],f['amount'],f['threshold']),(4,4,2,0))
    def test_randomized_auto_tip_uses_native_filter_scope(self):
        definition='<Brush type="auto_brush" randomness=".6" density="1"><MaskGenerator type="circle" ratio="1" diameter="16" id="soft" softness_curve="0,1;1,0;" antialiasEdges="0"/></Brush>'
        extra='<param name="Filter/id">unsharp</param><param name="Filter/smudgeMode">false</param>'
        with tempfile.TemporaryDirectory() as tmp:
            result=preset(kpp(definition,extra,engine='filter'),'random.kpp',Catalog(Path(tmp)),{})
        self.assertEqual(result['descriptor']['version'],192)
        self.assertTrue(scope192(result['descriptor']))
        self.assertEqual(result['descriptor']['tip']['autoNoise']['randomness'],.6)
    def test_ignored_native_pixel_settings(self):
        label,data=fixtures192()[0]
        from krita_import import xml
        from native_mask190 import png_preset
        image=Image.open(io.BytesIO(data));root=xml(image.info['preset'])
        import xml.etree.ElementTree as ET
        for key,value in {'PressureFlow':'true','FlowValue':'.2','PressureOpacity':'true','PressureScatter':'true','MaskingBrush/Enabled':'true'}.items():ET.SubElement(root,'param',name=key).text=value
        with tempfile.TemporaryDirectory()as tmp:
            d=preset(png_preset(root),'ignored.kpp',Catalog(Path(tmp)),{})['descriptor']
            self.assertTrue(scope192(d));self.assertEqual(d['flow'],1);self.assertNotIn('scatter',d);self.assertNotIn('dual',d['behavior'])
    def test_all_scalar_texture_modes_and_fallback(self):
        from native_mask190 import png_preset
        from krita_import import xml
        source=dict(fixtures192())['texture-12'];image=Image.open(io.BytesIO(source));root=xml(image.info['preset'])
        mode_node=next(n for n in root.findall('param')if n.get('name')=='Texture/Pattern/TexturingMode')
        expected={0:'multiply',1:'subtract',2:'subtract',3:'subtract',4:'darken',5:'overlay',6:'colorDodge',7:'colorBurn',8:'linearDodge',9:'linearBurn',10:'hardMixPhotoshop',11:'hardMixSofterPhotoshop',12:'height',13:'linearHeight',14:'heightPhotoshop',15:'linearHeightPhotoshop'}
        with tempfile.TemporaryDirectory()as tmp:
            for mode,application in expected.items():
                mode_node.text=str(mode)
                with self.subTest(mode=mode):
                    d=preset(png_preset(root),'scalar.kpp',Catalog(Path(tmp)/str(mode)),{})['descriptor'];self.assertTrue(scope192(d));self.assertEqual(d['texture']['application']['mode'],application);self.assertNotIn('eraseId',d['texture']);self.assertNotIn('material',d['texture'])
    def test_static_image_CAS_is_gray_not_alpha_or_inverse(self):
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));d=preset(fixtures192()[5][1],'image.kpp',c,{})['descriptor'];a=c.assets[d['tip']['mask']]
            self.assertEqual((c.output/a['file']).read_bytes(),bytes([64,110,76,64]));self.assertEqual(d['tip']['imageSampling']['sourceRect'],{'x':0,'y':0,'width':2,'height':2});self.assertNotIn('color',d['tip'])
    def test_all_auto_profiles_spikes_noise_and_soft_AA(self):
        with tempfile.TemporaryDirectory()as tmp:
            for profile in('default','gauss','soft'):
                for shape in('circle','rect'):
                    definition='<Brush type="auto_brush" spacing=".1" density=".7" randomness=".3"><MaskGenerator diameter="16" type="'+shape+'" ratio=".6" hfade=".4" vfade=".7" id="'+profile+'" spikes="5" antialiasEdges="1" softness_curve="0,0;1,1"/></Brush>'
                    with self.subTest(profile=profile,shape=shape):
                        c=Catalog(Path(tmp)/(profile+shape));data=kpp(definition,'<param name="Filter/id">invert</param><param name="Filter/smudgeMode">true</param>',engine='filter',mode='copy');d=preset(data,'form.kpp',c,{})['descriptor']
                        self.assertTrue(scope192(d));self.assertEqual(d['tip']['autoShape']['spikes'],5);self.assertEqual(d['tip']['autoNoise']['density'],.7)
                        if profile=='soft'and shape=='circle':self.assertIs(d['tip']['profile']['antialias'],True)
                        from filter_mask192 import validate_filter192_portable
                        validate_filter192_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)

    def test_native_dimensions_and_fan_mirror_opacity(self):
        from krita_import import xml
        from native_mask190 import png_preset
        import xml.etree.ElementTree as ET
        root=xml(Image.open(io.BytesIO(fixtures192()[6][1])).info['preset'])
        resource=next(root.iter('resource'));raw=base64.b64decode(resource.text);header,body=raw.split(b'\n',2)[1:]
        resource.text=base64.b64encode(b'Own Filter192\n4 ncells:4 dim:2 rank0:2 sel0:angular rank1:2 sel1:pressure\n'+body+body).decode()
        flags={'OpacityValue':'.6','PressureRotation':'true','RotationSensor':'<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="30"/>','PressureMirror':'true','HorizontalMirrorEnabled':'true','VerticalMirrorEnabled':'true'}
        for key,value in flags.items():ET.SubElement(root,'param',name=key).text=value
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));d=preset(png_preset(root),'dimensions.kpp',c,{})['descriptor'];self.assertTrue(scope192(d));self.assertEqual(d['tip']['animation']['mode'],'dimensions');self.assertEqual(d['opacity'],.6);self.assertIn('strokeInput',d['behavior']);self.assertIn('mirror',d['behavior'])
            from filter_mask192 import validate_filter192_portable
            validate_filter192_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)

    def test_all_canonical_composites_match_shared(self):
        import re
        from filter_mask192 import COMPOSITES,validate_filter192_portable
        shared=(Path(__file__).resolve().parents[2]/'packages/shared/src/brushBehavior.ts').read_text()
        bank=re.search(r"BRUSH_BLEND_MODES: readonly BrushBlendMode\[\] = \[(.*?)\]",shared).group(1)
        modes=re.findall(r"'([^']+)'",bank)
        self.assertEqual(set(COMPOSITES),{'copy','erase',*modes});self.assertEqual(len(COMPOSITES),30)
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));d=preset(fixtures192()[0][1],'mode.kpp',c,{})['descriptor']
            for mode in COMPOSITES:
                d['filter']['composite']=mode
                validate_filter192_portable(d,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
