"""Actual KPP→CAS tests. Independent byte literals, no compiler self-oracle."""
import io,struct,tempfile,unittest
from unittest.mock import patch
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp


def png(image):
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()

def gbr(pixel, channels=4):
    return struct.pack('>7I',29,2,1,1,channels,0x47494d50,25)+b'\0'+bytes(pixel)

class AlphaMaskAdjustmentTests(unittest.TestCase):
    def imported(self,tmp,resource,filename='tip.png',controls='',application=0):
        path=Path(tmp)/'Input.kpp';definition=f'<Brush type="gbr_brush" filename="{filename}" brushApplication="{application}" AdjustmentVersion="2" {controls}/>'
        path.write_bytes(kpp(definition));c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{filename:resource});self.assertEqual(c.skipped,[]);return c,c.brushes[0]
    def coverage(self,c,b,frame=None):
        tip=b['descriptor']['tip'];aid=tip['mask'] if frame is None else tip['animation']['frames'][frame];a=c.assets[aid];data=(c.output/a['file']).read_bytes();return sorted(set(data)-{0})
    def test_image_brightness_uses_adjusted_gray_then_original_alpha(self):
        # gray127 ->brightness1 gray255 ->coverage0, alpha64 untouched.
        with tempfile.TemporaryDirectory() as tmp:
            c,b=self.imported(tmp,gbr([127,127,127,64]),'tip.gbr','BrightnessAdjustment="1"')
            self.assertEqual(self.coverage(c,b),[])
            self.assertFalse(any(n['feature']=='alphaMaskAdjustments' and n['status']=='unsupported' for n in b['compatibility']))
        # contrast1 threshold at127: gray100 ->0, alpha64 ->coverage64.
        with tempfile.TemporaryDirectory() as tmp:
            c,b=self.imported(tmp,gbr([100,100,100,64]),'tip.gbr','ContrastAdjustment="1"')
            self.assertEqual(self.coverage(c,b),[64])
    def test_opaque_gray_png_and_l_gbr_ignore_colorful_adjustments(self):
        for filename,resource in [('tip.png',png(Image.new('RGB',(1,1),(100,100,100)))),('tip.gbr',gbr([155],1))]:
            with self.subTest(filename=filename),tempfile.TemporaryDirectory() as tmp:
                c,b=self.imported(tmp,resource,filename,'BrightnessAdjustment="1"');self.assertEqual(self.coverage(c,b),[155])
    def test_transparent_gray_png_is_native_image_not_mask(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b=self.imported(tmp,png(Image.new('RGBA',(1,1),(100,100,100,128))),controls='ContrastAdjustment="1"');self.assertEqual(self.coverage(c,b),[128])
    def test_image_stamp_rgb_and_alpha_never_adjusted(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b=self.imported(tmp,gbr([31,102,204,128]),'tip.gbr','BrightnessAdjustment="1"',1);tip=b['descriptor']['tip'];self.assertEqual(self.coverage(c,b),[128]);self.assertIn('color',tip)
            self.assertEqual([sorted(set((c.output/c.assets[a]['file']).read_bytes())-{0}) for a in tip['color']['planes']],[[31],[102],[204]])
    def test_pipe_adjusts_each_rgba_frame_once(self):
        resource=b'Authored\n2 ncells:2 dim:1 rank0:2 sel0:incremental\n'+gbr([100,100,100,64])+gbr([200,200,200,128])
        with tempfile.TemporaryDirectory() as tmp:
            c,b=self.imported(tmp,resource,'tip.gih','ContrastAdjustment="1"');self.assertEqual(self.coverage(c,b,0),[64]);self.assertEqual(self.coverage(c,b,1),[])
    def test_default_image_mask_keeps_existing_policy_and_identity(self):
        for pixel in [[31,102,204,255],[100,100,100,128],[100,100,100,255]]:
            with self.subTest(pixel=pixel),tempfile.TemporaryDirectory() as tmp:
                # Native no-op adjustments must not promote a formerly coloured
                # source into the special opaque-gray integer-pyramid policy.
                first=Path(tmp)/'old';first.mkdir();second=Path(tmp)/'new';second.mkdir()
                import krita_import
                if not hasattr(krita_import,'alpha_mask_image'):continue
                with patch('krita_import.alpha_mask_image',side_effect=lambda image,definition:image):
                    _,old=self.imported(first,gbr(pixel),'tip.gbr')
                _,new=self.imported(second,gbr(pixel),'tip.gbr');self.assertEqual(old['descriptor'],new['descriptor'])
    def test_asset_identity_changes_without_new_renderer_revision(self):
        results=[]
        for controls in ['', 'BrightnessAdjustment="1"']:
            with tempfile.TemporaryDirectory() as tmp:
                c,b=self.imported(tmp,gbr([100,100,100,128]),'tip.gbr',controls);results.append(b['descriptor'])
        self.assertNotEqual(results[0]['tip']['mask'],results[1]['tip']['mask']);self.assertNotEqual(results[0]['id'],results[1]['id']);self.assertEqual(results[0]['version'],results[1]['version'])
    def test_midpoint_and_brightness_are_not_applied_twice(self):
        # gray127 +brightness.5 ->191; inverse64 *alpha128 rounds32.
        for controls,pixel,expected in [('BrightnessAdjustment=".5"',[127,127,127,128],32),('AdjustmentMidPoint="63"',[63,63,63,255],128)]:
            with self.subTest(controls=controls),tempfile.TemporaryDirectory() as tmp:
                c,b=self.imported(tmp,gbr(pixel),'tip.gbr',controls);self.assertEqual(self.coverage(c,b),[expected])
    def test_lightness_application_still_has_single_adjustment_and_original_alpha(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b=self.imported(tmp,gbr([127,127,127,128]),'tip.gbr','BrightnessAdjustment=".5"',2);tip=b['descriptor']['tip'];self.assertEqual(self.coverage(c,b),[128]);aid=tip['material']['gray'];self.assertEqual(sorted(set((c.output/c.assets[aid]['file']).read_bytes())-{0}),[191])
    def test_singular_native_transfer_is_rejected_instead_of_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'Input.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gbr" brushApplication="0" AdjustmentVersion="2" AdjustmentMidPoint="0"/>'));c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.gbr':gbr([100,100,100,128])});self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)
if __name__=='__main__':unittest.main()
