"""Reproduce versioned functional power-U8 pages without host libm.

No output is written without --execute. Bytes are RGBA64x256: row=destination,
column=floor(source/4), channel=source%4. Rational normalized inputs and the
explicit decimal literals define this approximation; native byte identity and
formally certified interval rounding are not claimed. Requires Python3 only.
"""
import argparse
import decimal
import hashlib
import json
from pathlib import Path

D=decimal.Decimal

MODES=('easyDodge','easyBurn','pNormA','superLight','softLightIfs')

LAW='defined-scalar23-power-u8-v1'

def pair(mode,s,d):
    x,y=D(s)/255,D(d)/255
    power=decimal.getcontext().power
    if mode=='easyDodge':
        value=D(1) if s==255 else D(0) if d==0 else power(y,(1-x)*D('1.039999999'))
    elif mode=='easyBurn':
        value=D(0) if d==0 else 1-power(D('0.000000000001') if s==255 else 1-x,y*D('1.039999999'))
    elif mode=='pNormA':
        if s==255 or d==255:return 255
        n=power(power(D(s),D('2.3333333333333333'))+power(D(d),D('2.3333333333333333')),D('.428571428571434'))
        return min(255,max(0,int(n.to_integral_value(rounding=decimal.ROUND_FLOOR))))
    elif mode=='superLight':
        p=D('2.875')
        value=1-power(power(1-y,p)+power(1-2*x,p),1/p) if x<D('.5') else power(power(y,p)+power(2*x-1,p),1/p)
    else:
        value=power(y,power(D(2),1-2*x))
    value=min(D(1),max(D(0),value))*255
    return int(value.to_integral_value(rounding=decimal.ROUND_HALF_UP))

def table(mode,precision):
    with decimal.localcontext() as ctx:
        ctx.prec=precision
        return bytes(pair(mode,s,d) for d in range(256) for s in range(256))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--mode',choices=MODES,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if not args.execute:
        print(json.dumps({'status':'PLAN','mode':args.mode,'law':LAW,'bytes':65536,'precisions':[70,100]}))
        return
    low=table(args.mode,70)
    high=table(args.mode,100)
    if low!=high:
        raise RuntimeError('Precision stability failed; no artifact emitted')
    digest=hashlib.sha256(high).hexdigest()
    args.output.mkdir(parents=True,exist_ok=True)
    target=args.output/(args.mode+'-'+digest+'.rgba')
    if target.exists():
        if target.read_bytes()!=high:
            raise RuntimeError('Existing content-addressed artifact is corrupt')
    else:
        with target.open('xb') as stream:
            stream.write(high)
    print(json.dumps({'law':LAW,'mode':args.mode,'sha256':digest,'bytes':len(high),
                      'precisionComparison':[70,100],'precisionMismatches':0,
                      'nativePixelIdentity':False,'formalIntervalProof':False}))

if __name__=='__main__':
    main()
