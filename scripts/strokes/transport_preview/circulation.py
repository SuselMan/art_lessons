"""Optional artistic, display-only circulation inside the same support mask.
This is explicitly NOT the engine's water velocity or physical pigment solver.
"""
import json
from pathlib import Path
import sys
import cv2
import numpy as np
from PIL import Image
root=Path(sys.argv[1])
for case in json.loads((root/'cases.json').read_text()):
    folder=root/case['id']
    images=[np.asarray(Image.open(folder/f'{key}.png').convert('RGBA'),dtype=float)/255 for key in ['wet','dry']]
    ink=sum((1-im[:,:,:3]).mean(2)*im[:,:,3] for im in images)
    support=cv2.morphologyEx((ink>.001).astype('uint8'),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    support|=(ink>0).astype('uint8')
    distance=cv2.distanceTransform(support,cv2.DIST_L2,5)
    h,w=support.shape;y,x=np.mgrid[:h,:w].astype('float32')
    # Curl of a smooth streamfunction: divergence-free before masking.
    vx=np.cos(y*.09)*np.sin(x*.075)
    vy=-(.075/.09)*np.cos(x*.075)*np.sin(y*.09)
    gate=np.clip(distance/8,0,1)
    frames=[]
    for i in range(case['frames']):
        t=i/(case['frames']-1);amp=4*np.sin(np.pi*t)
        rgb=np.asarray(Image.open(folder/f'{i:03}.webp').convert('RGB'))
        warped=cv2.remap(rgb,(x-amp*vx*gate).astype('float32'),(y-amp*vy*gate).astype('float32'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=(255,255,255))
        warped[~support.astype(bool)]=255
        im=Image.fromarray(warped);im.save(folder/f'fluid-{i:03}.webp',lossless=True);frames.append(im)
    frames[0].save(folder/'circulation.webp',save_all=True,append_images=frames[1:],duration=125,loop=0,lossless=True)
    collage=Image.new('RGB',(w*4,h),'white')
    for j,i in enumerate([0,16,40,64]):collage.paste(frames[i],(j*w,0))
    collage.save(folder/'circulation-timeline.jpg',quality=94)
    print(case['id'], '4px display-only circulation',flush=True)
