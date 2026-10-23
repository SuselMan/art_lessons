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
from krita_import import convert_krita, gbr, xml


def kpp(definition=None, resources='', engine='paintbrush', mode='normal'):
    definition=definition or '<Brush type="auto_brush" spacing="0.2" angle="0"><MaskGenerator type="circle" ratio="0.5" hfade="1" vfade="1"/></Brush>'
    preset=f'<Preset name="QA Krita" paintopid="{engine}"><param name="brush_definition"><![CDATA[{definition}]]></param><param name="CompositeOp">{mode}</param><param name="SizeUseCurve">true</param><param name="SizeSensor"><![CDATA[<params id="pressure"><curve>0,0;0.5,0.2;1,1;</curve></params>]]></param>{resources}</Preset>'
    meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',preset,zip=True)
    out=io.BytesIO();Image.new('RGB',(2,2),'red').save(out,format='PNG',pnginfo=meta)
    return out.getvalue()


class KritaTests(unittest.TestCase):
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
