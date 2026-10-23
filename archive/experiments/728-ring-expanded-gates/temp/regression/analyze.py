"""CPU image profiles; no adaptive edge selection and no PNG-as-mass claim."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, hashlib, statistics, sys

root=Path(sys.argv[1]); report=json.loads((root/'report.json').read_text())
roi=(910,455,1264,721); results=[]; crops=[]
def darkness(im,x,y):
    r,g,b,a=im.getpixel((x,y));return 1-(.2126*r+.7152*g+.0722*b)/255
for arm in report['arms']:
    if not isinstance(arm.get('finalPNG'),dict): continue
    stem=arm['revision']+'-'+arm['policy']; image=Image.open(root/arm['finalPNG']['file']).convert('RGBA')
    material=Image.open(root/arm['transparentPNG']['file']).convert('RGBA'); crop=image.crop(roi).convert('RGB');crop.save(root/(stem+'-slot2.png'));crops.append((stem,crop))
    profiles=[]
    for direction,centres,start,end in [('x',[587,592,597],1010,1147),('y',[1075,1080,1085],542,643)]:
        for fixed in centres:
            values=[]
            for t in range(start,end):
                x,y=(t,fixed) if direction=='x' else (fixed,t)
                neighbours=[(x,y+i) if direction=='x' else (x+i,y) for i in range(-2,3)]
                values.append({'coordinate':t,'darkness':sum(darkness(image,a,b) for a,b in neighbours)/5,'alpha':sum(material.getpixel((a,b))[3]/255 for a,b in neighbours)/5})
            profiles.append({'axis':direction,'fixed':fixed,'values':values})
    # Fixed source-geometry bands, not fitted to the candidate result.
    bands=[]
    for x,y,nx,ny in [(1044,592,-1,0),(1115,592,1,0),(1080,570,0,-1),(1080,615,0,1)]:
        values=[darkness(image,x+nx*d,y+ny*d) for d in range(-12,13)]
        middle=statistics.mean(values[10:15]); inward=statistics.mean(values[3:8]);outward=statistics.mean(values[17:22])
        bands.append({'origin':[x,y],'outwardNormal':[nx,ny],'darkness':values,'middle':middle,'inward':inward,'outward':outward,'dipAgainstBothNeighbours':max(0,min(inward,outward)-middle)})
    interior=[]
    for y in range(587,598):
        for x in range(1073,1088):interior.append(material.getpixel((x,y)))
    mean=[sum(p[c]*p[3]/255 for p in interior)/len(interior) for c in range(3)]
    record={'arm':stem,'sameWorldROI':list(roi),'profiles':profiles,'fixedBoundaryBands':bands,'interiorPremultRGB':mean,'interiorAlpha':sum(p[3] for p in interior)/len(interior),'wholeRGBA':arm['finalPNG'],'transparentRGBA':arm['transparentPNG'],'actualMaterial':arm.get('material'),'materialAt':arm.get('materialAt')}
    results.append(record)
if crops:
    atlas=Image.new('RGB',(354*len(crops),296),'white'); draw=ImageDraw.Draw(atlas)
    for i,(stem,crop) in enumerate(crops):atlas.paste(crop,(354*i,30));draw.text((354*i+5,8),stem,fill='black')
    atlas.save(root/'slot2-historical-atlas.png')
(root/'slot2-profile-metrics.json').write_text(json.dumps({'sourceBounds':[1043.2530603408813,570.2775650024414,1115.6178493499756,615.1644554138184],'scope':'fixed image profiles, not physical mass or automatic good/bad classifier','arms':results},indent=2))
print([(x['arm'],[round(b['dipAgainstBothNeighbours'],6) for b in x['fixedBoundaryBands']]) for x in results])
