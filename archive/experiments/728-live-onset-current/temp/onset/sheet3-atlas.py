from PIL import Image,ImageDraw
import pathlib,json,gzip
R=pathlib.Path(__file__).parent/'sheet3-stage-first';r=json.loads((R/'report.json').read_text()); names=['pre-carry','pre-diffuse-post-carry','pre-group-tide-post-diffuse','post-group-dry-P-C'];atlas=Image.new('RGB',(4*354,2*306+306),'white');d=ImageDraw.Draw(atlas)
for row,a in enumerate(r['arms']):
 for col,name in enumerate(names):
  p=next(p for p in a['planes'] if p['label']==name);rec=next(x for x in p['records'] if x['name']=='P');w,h=rec['read'][2:];raw=gzip.decompress((R/rec['file']).read_bytes());rgb=bytes(v for i in range(w*h) for v in [255-raw[4*i+1]]*3);im=Image.frombytes('RGB',(w,h),rgb).transpose(Image.Transpose.FLIP_TOP_BOTTOM);atlas.paste(im,(col*354,row*306+35));d.text((col*354+5,row*306+5),('ON ' if a['phase'] else 'OFF ')+name,fill='black')
for col,flag in enumerate(['OFF','ON']):
 im=Image.open(R/(flag+'-final.png'));print(flag,'PNG',im.size);crop=im.crop((910,455,1264,721)).convert('RGBA');bg=Image.new('RGBA',crop.size,'white');bg.alpha_composite(crop);atlas.paste(bg.convert('RGB'),(col*354,2*306+35));d.text((col*354+5,2*306+5),flag+' actual final PNG crop',fill='black')
atlas.save(R/'stage-atlas.jpg',quality=93)
