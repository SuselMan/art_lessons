from pathlib import Path
root=Path('temp/wc-runs/overnight-next/morning-next');original=(root/'chronological-h-nine-prefix/run.py').read_text()
for cap in [511,1023,4095]:
 s=original.replace("out=r/'morning-next/chronological-h-nine-prefix'",f"out=r/'morning-next/chronological-h-nine-prefix-wide/cap{cap}';out.mkdir(parents=True,exist_ok=True);CAPACITY={cap}")
 old="exec(ref.read_text().split('results={};outputs={}')[0],env)"
 new="referenceCode=ref.read_text().split('results={};outputs={}')[0].replace('(255-pair[k][ja+q])//4','('+str(CAPACITY)+'-pair[k][ja+q])//4').replace('0<=v<=255','0<=v<='+str(CAPACITY));(out/'actual-brush-reference.py').write_text(referenceCode);exec(referenceCode,env)"
 assert s.count(old)==1;s=s.replace(old,new).replace('room=255-q[rec]','room=CAPACITY-q[rec]').replace('v.max()<=255','v.max()<=CAPACITY').replace('clip=np.maximum(unclipped-255,0)','clip=np.maximum(unclipped-CAPACITY,0)').replace('outputs[mode]=np.array(M,np.uint8)','outputs[mode]=np.array(M,np.uint16)').replace(".write_bytes(bytes(M[k]))", ".write_bytes(np.asarray(M[k],np.uint16).tobytes())")
 s=s.replace("report=dict(captureSHA256=", "report=dict(materialCodeCapacity=CAPACITY,capacityChange='255 to explicit wider CPU material code bound; source units NOT rescaled; P/C-only brush does not move independent H; not RGBA8/GPU model',captureSHA256=")
 s=s.replace("Image.fromarray(outputs[mode][0,:,:,2][::-1]).save(out/f'{mode}-P-B.png')", "np.save(out/f'{mode}-PC.npy',outputs[mode]);np.save(out/f'{mode}-Hcodes.npy',H)")
 s=s.replace("HsumCodes=int(H.sum()))", "HsumCodes=int(H.sum()),PBminusCAmax=int(np.max(abs(np.asarray(M[0]).reshape(h,w,4)[:,:,2]-np.asarray(M[1]).reshape(h,w,4)[:,:,3]))),inventoryOutsideOriginalA0P_B=int(np.asarray(M[0]).reshape(h,w,4)[:,:,2][~domain].sum()))")
 (root/f'chronological-h-nine-prefix-wide/run-cap{cap}.py').write_text(s)
