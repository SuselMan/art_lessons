"""Self-authored KPP/Bundle fixtures. No redistributed Krita brush artwork."""
import base64
import io
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
from PIL import Image, PngImagePlugin
import convert
from krita_import import convert_krita, gbr, gih, xml, gaussian_circle, tip_asset


def kpp(definition=None, resources='', engine='paintbrush', mode='normal'):
    definition=definition or '<Brush type="auto_brush" spacing="0.2" angle="0"><MaskGenerator type="circle" ratio="0.5" hfade="1" vfade="1"/></Brush>'
    preset=f'<Preset name="QA Krita" paintopid="{engine}"><param name="brush_definition"><![CDATA[{definition}]]></param><param name="CompositeOp">{mode}</param><param name="SizeUseCurve">true</param><param name="SizeSensor"><![CDATA[<params id="pressure"><curve>0,0;0.5,0.2;1,1;</curve></params>]]></param>{resources}</Preset>'
    meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',preset,zip=True)
    out=io.BytesIO();Image.new('RGB',(2,2),'red').save(out,format='PNG',pnginfo=meta)
    return out.getvalue()


class KritaTests(unittest.TestCase):
    def test_tip_bounds_keep_native_square_and_odd_portrait_extent(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=convert.Catalog(Path(tmp)/'out')
            _,bounds=tip_asset(Image.new('L',(300,300),255),c,[])
            self.assertEqual(bounds,{'x':106/512,'y':106/512,'width':300/512,'height':300/512})
            _,bounds=tip_asset(Image.new('L',(169,170),255),c,[])
            self.assertEqual(bounds,{'x':42.5/256,'y':43/256,'width':170/256,'height':170/256})
            aid,bounds=tip_asset(Image.new('L',(1,32),255),c,[])
            self.assertEqual(c.assets[aid]['size'],64)
            self.assertEqual(bounds,{'x':15.5/64,'y':16/64,'width':.5,'height':.5})

    def test_sensor_curve_extends_boundary_without_changing_native_knots(self):
        from krita_import import sensor_controls
        params={'SizeSensor':'<params id="pressure"><curve>.2,.3;.8,.9;</curve></params>'}
        self.assertEqual(sensor_controls(params,'Size',[])[0]['curve'],[[0,.3],[.2,.3],[.8,.9],[1,.9]])

    def test_gih_descriptor_preserves_frames_and_exact_eof_diagnostic(self):
        def frame(value):
            return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([value])*9
        for mode in ['random','incremental']:
            for actual in [1,2]:
                pipe=('Authored\n2 dim:1 rank0:2 sel0:'+mode+'\n').encode()+frame(64)+(frame(192) if actual==2 else b'')
                with tempfile.TemporaryDirectory() as tmp:
                    p=Path(tmp)/'QA.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gih" scale="2"/>'))
                    c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'brushes/tip.gih':pipe})
                    self.assertEqual(c.skipped,[])
                    brush=c.brushes[0];tip=brush['descriptor']['tip']
                    self.assertEqual(brush['sourceDefaults']['sizePx'],6)
                    self.assertEqual(tip['maskBounds']['width'],.75)
                    if actual==2:
                        self.assertEqual(tip['animation']['mode'],mode)
                        self.assertEqual(len(tip['animation']['frames']),2)
                        self.assertEqual(tip['animation']['frames'][0],tip['mask'])
                        self.assertNotEqual(*tip['animation']['frames'])
                    else:
                        self.assertNotIn('animation',tip)
                        self.assertTrue(any(n['feature']=='gihFrameCount' for n in brush['compatibility']))

    def test_source_defaults_do_not_apply_opacity_flow_twice(self):
        definition='<Brush type="auto_brush"><MaskGenerator type="circle" diameter="40" hfade="1" vfade="1"/></Brush>'
        params='<param name="OpacityValue">.6</param><param name="FlowValue">.4</param>'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp(definition,params));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            brush=c.brushes[0]
            self.assertEqual(brush['sourceDefaults'],{'sizePx':40,'opacity':.6,'flow':.4})
            self.assertEqual(brush['descriptor']['opacity'],.6)
            self.assertEqual(brush['descriptor']['flow'],.4)

    def test_gih_keeps_all_frames_and_selection(self):
        def frame(w,h,value):
            return struct.pack('>7I',29,2,w,h,1,0x47494d50,25)+b'\0'+bytes([value])*(w*h)
        data=b'Authored pipe\n2 ncells:2 dim:1 rank0:2 sel0:random\n'+frame(2,2,64)+frame(3,1,192)
        result=gih(data)
        self.assertEqual(result['mode'],'random')
        self.assertEqual([f.size for f in result['frames']],[(2,2),(3,1)])
        self.assertEqual([f.getpixel((0,0)) for f in result['frames']],[64,192])
        for invalid in [data[:-1],data+b'extra',data.replace(b'dim:1',b'dim:2'),data.replace(b'sel0:random',b'sel0:pressure'),data.replace(b'rank0:2',b'rank0:3')]:
            with self.assertRaises(ValueError):gih(invalid)
        incomplete=data[:-len(frame(3,1,192))]
        result=gih(incomplete)
        self.assertEqual(len(result['frames']),1)
        self.assertEqual(result['declaredCount'],2)

    def test_adaptive_spacing_retains_vendor_coefficient(self):
        definition='<Brush type="auto_brush" spacing=".1" useAutoSpacing="1" autoSpacingCoeff=".8"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp(definition));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            self.assertEqual(c.brushes[0]['descriptor']['behavior']['spacing'],{'mode':'kritaAuto','coefficient':.8})
            self.assertEqual(c.brushes[0]['descriptor']['spacing'],.1)

    def test_gaussian_profile_is_symmetric_monotonic_and_not_linear_hardness(self):
        image=gaussian_circle(.15,.15,10)
        self.assertEqual(image.getpixel((0,0)),0)
        row=[image.getpixel((x,128)) for x in range(128,256)]
        self.assertEqual(row,sorted(row,reverse=True))
        self.assertEqual(row[64],99)
        self.assertEqual(image.tobytes(),image.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes())
        self.assertEqual(image.tobytes(),image.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes())

    def test_gaussian_preset_routes_bitmap_and_keeps_fidelity_warning(self):
        definition='<Brush type="auto_brush"><MaskGenerator id="gauss" type="circle" ratio="1" hfade=".15" vfade=".15" diameter="10" spikes="2"/></Brush>'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp(definition));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            self.assertEqual(c.skipped,[])
            brush=c.brushes[0]
            self.assertEqual(brush['descriptor']['tip']['kind'],'bitmap')
            self.assertTrue(any(n['feature']=='gaussianGenerator' and n['status']=='approximate' for n in brush['compatibility']))

    def test_legacy_bytearray_embedded_pattern_and_native_period(self):
        out=io.BytesIO();Image.new('L',(8,8),128).save(out,format='PNG')
        encoded=base64.b64encode(out.getvalue())
        for attribute, value in [('',encoded), (' type="bytearray"',base64.b64encode(encoded))]:
            params='<param name="Texture/Pattern/Enabled">true</param><param name="Texture/Pattern/PatternFileName">/missing/paper.png</param><param name="Texture/Pattern/Scale">1.5</param>'
            params+='<param name="Texture/Pattern/Pattern"'+attribute+'>'+value.decode()+'</param>'
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/'QA.kpp';p.write_bytes(kpp(resources=params));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
                self.assertEqual(c.skipped,[])
                self.assertEqual(c.brushes[0]['descriptor']['texture']['periodPx'],12)
                self.assertEqual(len(c.assets),1)

    def test_kpp_metadata_not_thumbnail_and_pressure(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp());c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            d=c.brushes[0]['descriptor']
            self.assertEqual(d['tip']['kind'],'round');self.assertNotIn('mask',d['tip'])
            self.assertEqual(d['tip']['aspect'],2);self.assertEqual(d['spacing'],0.2)
            self.assertEqual(d['sizeByPressure'],[[0,0],[0.5,0.2],[1,1]])
            self.assertEqual(c.assets,{})
    def test_embedded_gbr_positive_coverage(self):
        raw=struct.pack('>7I',29,2,2,2,1,0x47494d50,25)+b'\0'+b'\0\x40\x80\xff'
        self.assertEqual(gbr(raw).tobytes(),b'\0\x40\x80\xff')
        resources='<resources><resource filename="tip.gbr" type="brushes">'+base64.b64encode(raw).decode()+'</resource></resources>'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gbr" spacing="0.1"/>',resources))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            self.assertEqual(len(c.brushes),1);self.assertEqual(len(c.assets),1)
            self.assertEqual(next(iter(c.assets.values()))['size'],2)
    def test_bundle_resolves_external_resources(self):
        raw=struct.pack('>7I',29,2,2,2,1,0x47494d50,25)+b'\0'+bytes([255]*4)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.bundle'
            with zipfile.ZipFile(p,'w') as z:
                z.writestr('paintoppresets/QA.kpp',kpp('<Brush type="gbr_brush" filename="tip.gbr"/>'))
                z.writestr('brushes/tip.gbr',raw)
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            self.assertEqual(len(c.brushes),1);self.assertEqual(c.skipped,[])
    def test_loose_kpp_resolves_installed_bundle_tip(self):
        raw=struct.pack('>7I',29,2,2,2,1,0x47494d50,25)+b'\0'+bytes([255]*4)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gbr" scale="3"/>'))
            c=convert.Catalog(Path(tmp)/'out')
            convert_krita(p,c,{'default.bundle/brushes/tip.gbr':lambda:raw})
            self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1)
            self.assertEqual(c.brushes[0]['sourceDefaults']['sizePx'],6)
    def test_missing_resources_and_unsupported_engines_skip_honestly(self):
        for data in [kpp('<Brush type="gbr_brush" filename="absent.gbr"/>'),kpp(engine='particlebrush')]:
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/'QA.kpp';p.write_bytes(data);c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
                self.assertFalse(c.brushes);self.assertEqual(len(c.skipped),1)
    def test_eraser_preset_uses_the_common_destination_out_compositor(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'Erase.kpp';p.write_bytes(kpp(mode='erase'));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            self.assertEqual(c.brushes[0]['descriptor']['model'],'stamp')
            self.assertTrue(c.brushes[0]['descriptor']['behavior']['erase'])

    def test_colorsmudge_routes_to_existing_mixer(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.kpp';p.write_bytes(kpp(engine='colorsmudge'));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            self.assertEqual(c.brushes[0]['descriptor']['model'],'mixer')
    def test_colorsmudge_rate_checkboxes_and_verified_missing_defaults(self):
        import xml.etree.ElementTree as E
        # Missing checkboxes are false (KisKritaSensorPack::read). Enabled
        # options with missing Value use strengthMaxValue=1, not a guessed .5.
        cases=[
            ({'PressureColorRate':'true','ColorRateValue':'0.3','PressureSmudgeRate':'true','SmudgeRateValue':'0.7'},.3,.7),
            ({'PressureColorRate':'false','ColorRateValue':'0.9','PressureSmudgeRate':'false','SmudgeRateValue':'0.2'},0,1),
            ({'ColorRateValue':'0.9','SmudgeRateValue':'0.2'},0,1),
            ({},0,1),
            ({'PressureColorRate':'true','PressureSmudgeRate':'true'},1,1),
            ({'PressureColorRate':'1','ColorRateValue':'0','PressureSmudgeRate':'1','SmudgeRateValue':'0'},0,0),
            ({'PressureColorRate':'true','ColorRateValue':'0.4','PressureSmudgeRate':'false','SmudgeRateValue':'0.1'},.4,1),
            ({'PressureColorRate':'false','ColorRateValue':'0.4','PressureSmudgeRate':'true','SmudgeRateValue':'0.1'},0,.1),
        ]
        for params,load,pickup in cases:
            with self.subTest(params=params), tempfile.TemporaryDirectory() as tmp:
                original=Image.open(io.BytesIO(kpp(engine='colorsmudge')))
                root=E.fromstring(original.info['preset'])
                for key,value in params.items(): E.SubElement(root,'param',{'name':key}).text=value
                meta=PngImagePlugin.PngInfo();meta.add_text('preset',E.tostring(root,encoding='unicode'))
                p=Path(tmp)/'Rates.kpp';Image.new('RGB',(2,2)).save(p,format='PNG',pnginfo=meta)
                c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
                self.assertEqual(c.skipped,[])
                self.assertEqual(c.brushes[0]['descriptor']['mixer'],{'load':load,'pickup':pickup,'strength':1})

    def test_colorsmudge_mapping_fix_has_new_content_identity_for_same_source(self):
        import copy
        from brush_contract import finalize_identity
        source=kpp(engine='colorsmudge')
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'Rates.kpp';p.write_bytes(source)
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            current=c.brushes[0]['descriptor']
            # Reconstruct the old unchecked/missing mapping against exactly the
            # same source and descriptor version. Immutable identity includes
            # final mixer parameters, so old rooms keep their former resource.
            old=copy.deepcopy(current);old['mixer'].update(load=.5,pickup=.5)
            finalize_identity(old,source)
            self.assertEqual(current['version'],5)
            previous=copy.deepcopy(current);previous['version']=4
            finalize_identity(previous,source)
            self.assertNotEqual(previous['id'],current['id'])
            self.assertNotEqual(old['id'],current['id'])
            self.assertEqual(finalize_identity(copy.deepcopy(current),source)['id'],current['id'])

    def test_krita_masking_uses_the_shared_independent_secondary(self):
        with tempfile.TemporaryDirectory() as tmp:
            import xml.etree.ElementTree as E
            original=Image.open(io.BytesIO(kpp()));root=E.fromstring(original.info['preset'])
            child='<Brush type="auto_brush" spacing="0.5"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>'
            for name,value in [('MaskingBrush/Enabled','true'),('MaskingBrush/MasterSizeCoeff','0.5'),('MaskingBrush/Preset/brush_definition',child)]:E.SubElement(root,'param',{'name':name}).text=value
            meta=PngImagePlugin.PngInfo();meta.add_text('preset',E.tostring(root,encoding='unicode'))
            p=Path(tmp)/'Mask.kpp';Image.new('RGB',(2,2)).save(p,format='PNG',pnginfo=meta)
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            dual=c.brushes[0]['descriptor']['behavior']['dual']
            self.assertEqual(dual['sampling'],'independent');self.assertEqual(dual['brush']['spacing'],0.5)
            self.assertEqual(dual['brush']['sizeByPressure'],[[0,0.5],[1,0.5]])

    def test_multiple_sensors_preserve_independent_curves_and_unknown_sensor(self):
        from krita_import import sensor_controls
        notes=[]
        params={'SizeUseSameCurve':'false','SizeSensor':'<params id="sensorslist"><ChildSensor id="pressure"><curve>0,1;1,0;</curve></ChildSensor><ChildSensor id="declination"><curve>0,0.1;1,1;</curve></ChildSensor><ChildSensor id="rotation"/></params>'}
        controls=sensor_controls(params,'Size',notes)
        self.assertEqual([c['control'] for c in controls],['pressure','tiltElevation'])
        self.assertEqual(controls[0]['curve'],[[0,1],[1,0]])
        self.assertTrue(any(n['status']=='unsupported' and 'rotation' in n['detail'] for n in notes))
        params['SizeUseSameCurve']='true';params['SizecommonCurve']='0,0.4;1,0.8;'
        self.assertEqual(sensor_controls(params,'Size',[])[0]['curve'],[[0,0.4],[1,0.8]])
        params['SizecommonCurve']='0,0;0,1;'
        with self.assertRaises(ValueError):sensor_controls(params,'Size',[])

    def test_scatter_uses_common_dynamics_and_reports_axis_approximation(self):
        import xml.etree.ElementTree as E
        original=Image.open(io.BytesIO(kpp()));root=E.fromstring(original.info['preset'])
        for key,value in [('PressureScatter','true'),('ScatterValue','0.8'),('Scattering/AxisX','false'),('Scattering/AxisY','true'),('ScatterSensor','<params id="pressure"/>')]:E.SubElement(root,'param',{'name':key}).text=value
        meta=PngImagePlugin.PngInfo();meta.add_text('preset',E.tostring(root,encoding='unicode'))
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'Scatter.kpp';Image.new('RGB',(2,2)).save(p,format='PNG',pnginfo=meta)
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c);d=c.brushes[0]['descriptor']
            self.assertEqual(d['scatter']['radius'],.8)
            self.assertFalse(d['behavior']['scatter']['bothAxes'])
            self.assertEqual(d['behavior']['modulations']['scatter'][0]['control'],'pressure')
            self.assertFalse(any(n['feature']=='activeDynamics' for n in c.brushes[0]['compatibility']))

    def test_native_krita_composite_identifiers(self):
        for source,target in [('linear light','linearLight'),('hard mix','hardMix'),('darker color','darkerColor')]:
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/'Mode.kpp';p.write_bytes(kpp(mode=source));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
                self.assertEqual(c.brushes[0]['descriptor']['behavior']['rendering']['blendMode'],target)

    def test_rejects_xml_entities_and_bad_gbr(self):
        with self.assertRaises(ValueError):xml('<!DOCTYPE a [<!ENTITY x "bad">]><a>&x;</a>')
        with self.assertRaises(ValueError):gbr(struct.pack('>5I',20,1,10000,10000,1))
    def test_rejects_unsafe_bundle_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'QA.bundle'
            with zipfile.ZipFile(p,'w') as z:z.writestr('../QA.kpp',kpp())
            with self.assertRaises(ValueError):convert_krita(p,convert.Catalog(Path(tmp)/'out'))
