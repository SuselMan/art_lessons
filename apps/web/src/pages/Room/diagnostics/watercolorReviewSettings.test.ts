import{it,expect}from'vitest'
import{defaultToolSettings}from '../../../lib/tools/toolSchemas'
import{watercolorReviewSettings}from './watercolorReviewSettings'
it('production and ordinary DEV preserve settings identity',()=>{const s=defaultToolSettings();expect(watercolorReviewSettings(s,'?wcReview400=1',false).settings).toBe(s);expect(watercolorReviewSettings(s,'',true).settings).toBe(s)})
it('explicit native review seeds UI settings without mutating input',()=>{const s=defaultToolSettings(),r=watercolorReviewSettings(s,'?wcReview400=1&wcNative=1',true);expect(r.enabled).toBe(true);expect(r.settings.watercolor).toMatchObject({size:400,water:1,pigment:1,nib:'round',pressureResponse:'normal',color:[.2,0,.6]});expect(s.watercolor.size).toBe(32);expect(r.settings.pencil).toBe(s.pencil)})
it('ambiguous/prerequisite-free seeds reject',()=>{for(const q of ['?wcReview400=1','?wcReview400=0&wcNative=1','?wcReview400=1&wcReview400=1&wcNative=1'])expect(()=>watercolorReviewSettings(defaultToolSettings(),q,true)).toThrow()})
