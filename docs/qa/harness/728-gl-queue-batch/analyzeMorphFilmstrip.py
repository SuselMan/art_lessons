"""Bounded QA RGB PNG analysis using Python stdlib, no image edits."""
import json, pathlib, struct, sys, zlib

def load_png(path):
    blob=pathlib.Path(path).read_bytes(); assert blob[:8]==b'\x89PNG\r\n\x1a\n'
    pos=8; compressed=b''
    while pos<len(blob):
        n=struct.unpack('>I',blob[pos:pos+4])[0]; kind=blob[pos+4:pos+8]; data=blob[pos+8:pos+8+n]; pos+=12+n
        if kind==b'IHDR':
            width,height,depth,typ,_,_,interlace=struct.unpack('>IIBBBBB',data)
            assert depth==8 and typ in (2,6) and interlace==0 and width*height<=640*640
            channels=3 if typ==2 else 4
        if kind==b'IDAT': compressed+=data
    raw=zlib.decompress(compressed); stride=width*channels; assert len(raw)==height*(stride+1)
    pixels=bytearray(); previous=bytearray(stride)
    for y in range(height):
        base=y*(stride+1); filter_type=raw[base]; row=bytearray(raw[base+1:base+1+stride])
        for i in range(stride):
            a=row[i-channels] if i>=channels else 0; b=previous[i]; corner=previous[i-channels] if i>=channels else 0
            if filter_type==0: value=0
            elif filter_type==1: value=a
            elif filter_type==2: value=b
            elif filter_type==3: value=(a+b)//2
            else:
                assert filter_type==4
                p=a+b-corner; da,db,dc=abs(p-a),abs(p-b),abs(p-corner)
                value=a if da<=db and da<=dc else b if db<=dc else corner
            row[i]=(row[i]+value)&255
        pixels+=row; previous=row
    return width,height,channels,pixels

def paint(rgb): return max(rgb)-min(rgb)>20 and min(rgb)<200

def analyze(report):
    scenario=report['rows'][0]['scenario']; frames=scenario['filmstrip']['frames']; w,h,c,first=load_png(frames[0]['path']); result=[]
    mask=[paint(first[i:i+3]) for i in range(0,len(first),c)]
    for frame in frames:
        ww,hh,cc,pixels=load_png(frame['path']); assert (ww,hh,cc)==(w,h,c)
        changed=over5=shape=maximum=0
        for index,i in enumerate(range(0,len(first),c)):
            delta=max(abs(pixels[i+j]-first[i+j]) for j in range(3)); changed+=delta>0; over5+=delta>5; maximum=max(maximum,delta); shape+=paint(pixels[i:i+3])!=mask[index]
        result.append({'at':frame['at'],'elapsed':frame['elapsed'],'changedPixels':changed,'changedPixelsOver5':over5,'maxRGBDelta':maximum,'paintMaskSymmetricDifference':shape})
    return {'frames':result,'paintMaskDefinition':'max(RGB)-min(RGB)>20 and min(RGB)<200; RGB output, not material alpha','scope':'Rendered post-UP thumbnails. Diagnostic display/readback, not physical latency or working-field parity.'}

if __name__=='__main__':
    print(json.dumps(analyze(json.loads(pathlib.Path(sys.argv[1]).read_text())),indent=2))
