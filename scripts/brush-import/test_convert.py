"""Synthetic fixtures only: no vendor brush assets are redistributed."""
import io
import json
from pathlib import Path
import plistlib
import struct
import tempfile
import unittest
import zipfile
from PIL import Image
import convert


def u32(n): return struct.pack('>I',n)
def text(s): return u32(len(s))+s.encode('utf-16-be')
def key(s): return u32(len(s))+s.encode()
def desc(fields):
    result=text('')+key('brushPreset')+u32(len(fields))
    for k,t,v in fields: result+=key(k)+t+v
    return result

def sample(pixels=b'\x00\x40\x80\xff', compressed=False):
    if compressed:
        pixels=struct.pack('>HH',3,3)+b'\x01\x00\x40\x01\x80\xff'
    channel=u32(8)+struct.pack('>IIII',0,0,2,2)+struct.pack('>HB',8,int(compressed))+pixels
    vmal=struct.pack('>IIII',0,0,2,2)+u32(0)+u32(1)+u32(len(channel))+channel+u32(0)
    return b'\x01x'+b'\0\1\0\0'+u32(3)+u32(len(vmal))+vmal

class ReaderTests(unittest.TestCase):
    def test_packbits_literal_repeat_noop(self):
        self.assertEqual(convert.packbits(b'\x01\x02\x03\xfe\x09\x80',5),b'\x02\x03\x09\x09\x09')
        for data in [b'\x05\x01',b'\xfd\x00']:
            with self.assertRaises(ValueError): convert.packbits(data,2)
    def test_vmal_channels_raw_and_rle(self):
        for compressed in [False,True]:
            sid,image=convert.abr_sample(sample(compressed=compressed),2)
            self.assertEqual(sid,'x');self.assertEqual(image.tobytes(),b'\x00\x40\x80\xff')
    def test_truncated_vmal_and_bad_dimensions(self):
        with self.assertRaises(ValueError): convert.abr_sample(sample()[:-1],2)
        with self.assertRaises(ValueError): convert.read_pixels(convert.Reader(b''),10001,2,8,0)
    def test_descriptor_types(self):
        data=desc([('Nm  ',b'TEXT',text('Test')),('Brsh',b'Objc',desc([('Spcn',b'UntF',b'#Prc'+struct.pack('>d',25))]))])
        result=convert.Reader(data).descriptor()
        self.assertEqual(result['Nm  '],'Test');self.assertEqual(result['Brsh']['Spcn']['value'],25)
    def test_modern_abr_sections_and_name(self):
        raw=sample(); samples=u32(len(raw))+raw+b'\0'*((-len(raw))%4)
        descriptor=desc([('Brsh',b'VlLs',u32(1)+b'Objc'+desc([('Nm  ',b'TEXT',text('Test'))]))])
        body=b'\0\6\0\2'+b'8BIMsamp'+u32(len(samples))+samples+b'8BIMdesc'+u32(4+len(descriptor))+u32(16)+descriptor
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'test.abr';p.write_bytes(body)
            images,presets,errors=convert.read_abr(p)
            self.assertEqual(images['x'].size,(2,2));self.assertEqual(presets[0]['Nm  '],'Test');self.assertEqual(errors,[])
    def test_keyed_archive_resolve_and_cycle_limit(self):
        raw=plistlib.dumps({'$objects':['$null',{'name':plistlib.UID(2)},'Test'],'$top':{'root':plistlib.UID(1)}},fmt=plistlib.FMT_BINARY)
        self.assertEqual(convert.resolve_archive(raw),{'name':'Test'})
        cycle=plistlib.dumps({'$objects':['$null',{'self':plistlib.UID(1)}],'$top':{'root':plistlib.UID(1)}},fmt=plistlib.FMT_BINARY)
        with self.assertRaises(ValueError): convert.resolve_archive(cycle)
    def test_assets_polarity_padding_dedupe_and_downsample(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=convert.Catalog(Path(tmp)); warnings=[]
            image=Image.frombytes('L',(3,1),b'\x00\x80\xff')
            aid=c.asset(image,warnings);self.assertEqual(aid,c.asset(image,[]));self.assertEqual(len(c.assets),1)
            asset=c.assets[aid];raw=(Path(tmp)/asset['file']).read_bytes()
            self.assertEqual(asset['size'],4);self.assertEqual(raw[4:7],b'\x00\x80\xff')
            c.asset(Image.new('L',(2049,1)),warnings);self.assertTrue(any('Downsampled' in w for w in warnings))
    def test_procreate_missing_embedded_resource_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.brushset'
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('test/Brush.archive',plistlib.dumps({'name':'Missing','bundledShapePath':'builtin.png'}))
            c=convert.Catalog(Path(tmp)/'out');convert.procreate(path,c)
            self.assertEqual(c.brushes,[]);self.assertIn('builtin.png',c.skipped[0]['reasons'][0])
    def test_identity_covers_changed_mask_or_grain_and_is_stable(self):
        with tempfile.TemporaryDirectory() as tmp:
            def import_variant(name, mask_value, grain_value):
                path = Path(tmp)/(name+'.brushset')
                with zipfile.ZipFile(path,'w') as z:
                    z.writestr('test/Brush.archive',plistlib.dumps({'name':'Same settings','plotSpacing':0.25}))
                    for filename,value in [('Shape.png',mask_value),('Grain.png',grain_value)]:
                        image=io.BytesIO();Image.new('L',(2,2),value).save(image,format='PNG')
                        z.writestr('test/'+filename,image.getvalue())
                catalog=convert.Catalog(Path(tmp)/name)
                convert.procreate(path,catalog)
                return catalog.brushes[0]['descriptor']
            original=import_variant('original',255,128)
            same=import_variant('same',255,128)
            mask_changed=import_variant('mask_changed',200,128)
            grain_changed=import_variant('grain_changed',255,64)
            self.assertEqual(original['id'],same['id'])
            self.assertNotEqual(original['id'],mask_changed['id'])
            self.assertNotEqual(original['id'],grain_changed['id'])
            self.assertEqual(original['tip']['mask'],grain_changed['tip']['mask'])
            self.assertEqual(original['texture']['id'],mask_changed['texture']['id'])
    def test_identity_covers_final_rendering_settings_and_importer_version(self):
        from unittest.mock import patch
        seed=b'unchanged source settings'
        original=convert.finalize_identity(convert.descriptor(seed,'asset:test'),seed)
        changed=convert.descriptor(seed,'asset:test');changed['spacing']=0.25
        self.assertNotEqual(original['id'],convert.finalize_identity(changed,seed)['id'])
        with patch.object(__import__('brush_contract'),'IMPORTER_RENDERING_VERSION',convert.IMPORTER_RENDERING_VERSION+1):
            upgraded=convert.finalize_identity(convert.descriptor(seed,'asset:test'),seed)
        self.assertNotEqual(original['id'],upgraded['id'])
    def test_procreate_manifest_with_texture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.brushset';b=io.BytesIO();Image.new('L',(2,2),255).save(b,format='PNG')
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('test/Brush.archive',plistlib.dumps({'name':'Test','plotSpacing':0.25,'grainDepth':0.5}))
                for file in ['Shape.png','Grain.png']: z.writestr('test/'+file,b.getvalue())
            c=convert.Catalog(Path(tmp)/'out');convert.procreate(path,c);m=c.write()
            self.assertEqual(m['brushes'][0]['descriptor']['spacing'],0.25)
            self.assertIn('periodPx',m['brushes'][0]['descriptor']['texture'])
            self.assertEqual(json.loads((c.output/'manifest.json').read_text())['schemaVersion'],1)

if __name__=='__main__': unittest.main()

class FidelityTests(unittest.TestCase):
    def test_signed_pressure_and_rotation_domains(self):
        self.assertEqual(convert.pressure_curve({'p':-0.4},'p'),[[0,1],[1,0.6]])
        self.assertEqual(convert.pressure_curve({'p':0.4},'p'),[[0,0.6],[1,1]])
    def test_procreate_v2_semantics_and_secondary(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.brushset';b=io.BytesIO();Image.new('L',(2,2),255).save(b,format='PNG')
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('a/Brush.archive',plistlib.dumps({'name':'A','plotSpacing':0.000002,'shapeRotation':-0.5,'shapeAzimuth':True,'shapeRandomise':True,'shapeCount':1,'dynamicsPressureOpacity':-0.3,'wetEdgesAmount':0.7}))
                z.writestr('a/Shape.png',b.getvalue())
                z.writestr('a/Sub1/Brush.archive',plistlib.dumps({'name':'B'}));z.writestr('a/Sub1/Shape.png',b.getvalue())
            c=convert.Catalog(Path(tmp)/'out');convert.procreate(path,c);d=c.brushes[0]['descriptor']
            self.assertEqual(len(c.brushes),1);self.assertEqual(d['spacing'],0.000002)
            self.assertEqual(d['scatter']['count'],16);self.assertEqual(d['behavior']['rotation']['random'],'stroke')
            self.assertEqual(d['behavior']['rotation']['follow'],-0.5);self.assertEqual(d['tip']['rotation'],'fixed')
            self.assertEqual(d['opacityByPressure'],[[0,1],[1,0.7]])
            self.assertIn('dual',d['behavior']);self.assertTrue(d['behavior']['rotation']['azimuth'])
    def test_published_procreate_blends_and_signed_modulations(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'test.brush';img=io.BytesIO();Image.new('L',(2,2),255).save(img,format='PNG')
            with zipfile.ZipFile(p,'w') as z:
                z.writestr('Brush.archive',plistlib.dumps({'name':'Blend probe','blendMode':1,'extendedBlend':17,'grainBlendMode':11,'dynamicsSpeedSize':-0.4,'dynamicsTiltOpacity':0.3}))
                z.writestr('Shape.png',img.getvalue());z.writestr('Grain.png',img.getvalue())
            c=convert.Catalog(Path(tmp)/'out');convert.procreate(p,c);b=c.brushes[0]['descriptor']['behavior']
            self.assertEqual(b['rendering']['blendMode'],'softLight');self.assertEqual(b['grain']['blendMode'],'overlay')
            self.assertAlmostEqual(b['modulations']['size'][0]['strength'],-0.4)
            self.assertAlmostEqual(b['modulations']['opacity'][0]['strength'],0.3)

    def test_modern_versions_fixed_preamble_and_sixteen_bit(self):
        for version in [6,7,9,10]:
            item=b'\x01x'+bytes(264)+struct.pack('>iiiiHB',0,0,1,2,16,0)+b'\x80\x00\xff\xff'
            body=u32(len(item))+item+b'\0'*((-len(item))%4)
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/'v.abr';p.write_bytes(struct.pack('>HH',version,2)+b'8BIMsamp'+u32(len(body))+body)
                samples,_,errors=convert.read_abr(p)
                self.assertEqual(errors,[]);self.assertEqual(samples['x'].tobytes(),b'\x80\xff')
    def test_pattern_rgb_and_bad_bounds(self):
        chans=[]
        for value in [255,128,0]:
            c=u32(8)+struct.pack('>iiiiHB',0,0,1,1,8,0)+bytes([value]);chans.append(u32(1)+u32(len(c))+c)
        vmal=struct.pack('>iiiiI',0,0,1,1,1)+b''.join(chans)
        pattern=u32(1)+u32(3)+bytes(4)+text('Pattern')+b'\x01p'+u32(3)+u32(len(vmal))+vmal
        pid,image=convert.read_pattern(pattern);self.assertEqual(pid,'p');self.assertEqual(image.getpixel((0,0)),151)
        with self.assertRaises(ValueError): convert.read_pattern(pattern[:-1])
    def test_indexed_pattern_uses_palette(self):
        palette=bytearray(768);palette[3:6]=bytes([255,128,0])
        channel=u32(8)+struct.pack('>iiiiHB',0,0,1,2,8,0)+bytes([1,0])
        vmal=struct.pack('>iiiiI',0,0,1,2,1)+u32(1)+u32(len(channel))+channel+u32(0)+u32(0)
        pattern=u32(1)+u32(2)+bytes(4)+text('Indexed')+b'\x01p'+palette+bytes(4)+u32(3)+u32(len(vmal))+vmal
        _,image=convert.read_pattern(pattern)
        self.assertEqual(list(image.getdata()),[151,0])
        with self.assertRaises(ValueError): convert.read_pattern(pattern[:-1])
    def test_legacy_sampled_records_and_resync(self):
        for version in [1,2]:
            record=bytes(4)+struct.pack('>H',25)+(text('Named') if version==2 else b'')+bytes(9)+struct.pack('>iiiiHB',0,0,1,2,8,0)+b'\x40\xff'
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/'old.abr';p.write_bytes(struct.pack('>HHHI',version,2,1,2)+b'xx'+struct.pack('>HI',2,len(record))+record)
                samples,presets,errors=convert.read_abr(p)
                self.assertEqual(samples['legacy-1'].tobytes(),b'\x40\xff');self.assertEqual(len(errors),1)
                self.assertEqual(presets[0]['Brsh']['Spcn'],25)
    def test_procedural_dynamics_and_percent_tool_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            p={'Brsh':{'_class':'computedBrush','Hrdn':{'unit':'#Prc','value':50}},'toolOptions':{'flow':{'unit':'#Prc','value':30},'Opct':70},'useTipDynamics':True,'szVr':{'bVTy':2,'jitter':20},'minimumDiameter':15,'useColorDynamics':True,'H   ':25}
            d,_=convert.photoshop_component(p,{},convert.Catalog(Path(tmp)),[],b'x')
            self.assertEqual(d['tip']['kind'],'round');self.assertEqual(d['tip']['hardness'],0.5)
            self.assertEqual(d['flow'],0.3);self.assertEqual(d['behavior']['dynamics']['size']['minimum'],0.15)
            self.assertEqual(d['behavior']['dynamics']['hue']['jitter'],0.25)

class PortableTests(unittest.TestCase):
    def test_portable_integrity_and_atomic_rejection(self):
        import base64,hashlib
        raw=bytes([0,128,128,255]);sha=hashlib.sha256(raw).hexdigest();aid='asset:'+sha
        d=convert.finalize_identity(convert.descriptor(b'x',aid),b'x')
        data={'library':{'schemaVersion':1,'brushes':[{'name':'Synthetic','source':'test','warnings':[],'descriptor':d}],'assets':[{'id':aid,'size':2,'file':sha+'.bin'}],'skipped':[]},'assets':{aid:base64.b64encode(raw).decode()}}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.grafetto-brushes.json';path.write_text(json.dumps(data));c=convert.Catalog(Path(tmp)/'valid');convert.portable_bundle(path,c)
            self.assertEqual(c.brushes[0]['descriptor']['id'],d['id']);self.assertEqual((c.output/(sha+'.bin')).read_bytes(),raw)
            data['assets'][aid]=base64.b64encode(bytes(4)).decode();path.write_text(json.dumps(data));bad=convert.Catalog(Path(tmp)/'bad')
            with self.assertRaises(ValueError): convert.portable_bundle(path,bad)
            self.assertEqual(list(bad.output.iterdir()),[])

class WetRoutingTests(unittest.TestCase):
    def test_wet_mix_parameters_select_mixer_including_charge_only(self):
        for settings in [{'dynamicsLoad':0.4},{'dynamicsMix':0.5},{'dynamicsAttack':0.2}, {'dynamicsBlur':0.1},{'dynamicsWetAccumulation':0.7},{'renderingRecursiveMixing':True}]:
            with self.subTest(settings=settings), tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'test.brush';image=io.BytesIO();Image.new('L',(2,2),255).save(image,format='PNG')
                with zipfile.ZipFile(path,'w') as z:
                    z.writestr('Brush.archive',plistlib.dumps(settings));z.writestr('Shape.png',image.getvalue())
                c=convert.Catalog(Path(tmp)/'out');convert.procreate(path,c);d=c.brushes[0]['descriptor']
                self.assertEqual(d['model'],'mixer');self.assertIn('wetMix',d['behavior'])
                self.assertEqual(set(d['mixer']),{'load','pickup','strength'})
                self.assertTrue(all(0<=v<=1 for v in d['mixer'].values()))
                self.assertTrue(any(n['feature']=='wetMix' and n['status']=='approximate' for n in c.brushes[0]['compatibility']))
    def test_dry_procreate_preserves_stamp_route(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'dry.brush';image=io.BytesIO();Image.new('L',(2,2),255).save(image,format='PNG')
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('Brush.archive',plistlib.dumps({'dynamicsLoad':0,'dynamicsMix':0}));z.writestr('Shape.png',image.getvalue())
            c=convert.Catalog(Path(tmp)/'out');convert.procreate(path,c)
            self.assertEqual(c.brushes[0]['descriptor']['model'],'stamp');self.assertNotIn('mixer',c.brushes[0]['descriptor'])
