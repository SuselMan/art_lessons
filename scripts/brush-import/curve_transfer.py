"""Independent natural cubic mathematics and bounded uniform response tables.

Format references: pinned KDE/Krita KisCubicCurve/KisCubicSpline and
KisDynamicSensor::parameter. Uses standard second-derivative spline equations;
no vendor implementation is copied. All compilation happens offline.
"""
import bisect
import math


def natural_run(points):
    count=len(points)
    if count==1:
        return lambda x:points[0][1]
    diagonal=[1.0]*count;lower=[0.0]*count;upper=[0.0]*count;rhs=[0.0]*count
    for i in range(1,count-1):
        left=points[i][0]-points[i-1][0];right=points[i+1][0]-points[i][0]
        lower[i]=left;diagonal[i]=2*(left+right);upper[i]=right
        rhs[i]=6*((points[i+1][1]-points[i][1])/right-(points[i][1]-points[i-1][1])/left)
    for i in range(1,count):
        factor=lower[i]/diagonal[i-1]
        diagonal[i]-=factor*upper[i-1];rhs[i]-=factor*rhs[i-1]
    second=[0.0]*count;second[-1]=rhs[-1]/diagonal[-1]
    for i in range(count-2,-1,-1):
        second[i]=(rhs[i]-upper[i]*second[i+1])/diagonal[i]
    xs=[p[0] for p in points]
    def evaluate(x):
        i=max(0,min(count-2,bisect.bisect_right(xs,x)-1))
        h=xs[i+1]-xs[i];a=(xs[i+1]-x)/h;b=(x-xs[i])/h
        return a*points[i][1]+b*points[i+1][1]+((a*a*a-a)*second[i]+(b*b*b-b)*second[i+1])*h*h/6
    return evaluate


def native_curve_is_identity(points):
    return bool(points) and points[0]==(0,0) and points[-1]==(1,1) and all(abs(x-y)*1e12<=min(abs(x),abs(y)) for x,y in points[1:-1])


def native_transfer(text, sample_count=256):
    if type(sample_count) is not int or not 2<=sample_count<=40002:
        raise ValueError('Krita transfer resolution exceeds bounded offline limit')
    records=[record.split(',') for record in text.split(';') if record.strip()]
    if not 1<=len(records)<=256:
        raise ValueError('Krita curve knot count exceeds limit')
    points=[];corners=[]
    for record in records:
        if len(record)<2:
            raise ValueError('Invalid Krita curve point')
        x,y=map(float,record[:2])
        if not math.isfinite(x) or not math.isfinite(y) or not 0<=x<=1 or not 0<=y<=1 or (points and x<=points[-1][0]):
            raise ValueError('Invalid or unordered Krita curve point')
        if points and x-points[-1][0]<1e-12:
            raise ValueError('Krita curve knots are too close for bounded spline compilation')
        points.append((x,y));corners.append('is_corner' in (flag.strip() for flag in record[2:]))
    # Identity sensors bypass the vendor lookup and retain raw input semantics.
    if all(abs(x-y)<=min(abs(x),abs(y))*1e-12 for x,y in points) and points[0]==(0,0) and points[-1]==(1,1):
        return [[0,0],[1,1]]
    ends=[0]+[i for i in range(1,len(points)-1) if corners[i]]+[len(points)-1]
    if len(points)==1:
        runs=[(points[-1][0],natural_run(points))]
    else:
        runs=[(points[end][0],natural_run(points[start:end+1])) for start,end in zip(ends,ends[1:])]
    samples=[]
    for i in range(sample_count):
        x=max(points[0][0],min(points[-1][0],i*(1/(sample_count-1))))
        evaluate=next((f for end,f in runs if x<=end),runs[-1][1])
        value=evaluate(x)
        if not math.isfinite(value):
            raise ValueError('Nonfinite Krita spline transfer')
        samples.append(max(0,min(1,value)))
    return {'kind':'uniform','samples':samples,'endpointEpsilon':1e-6,'preserveInputSign':True}


def scaled_curve(curve,factor):
    if isinstance(curve,dict):
        return {**curve,'samples':[value*factor for value in curve['samples']]}
    return [[x,y*factor] for x,y in curve]
