import math,json
rows=[]
for degree in [0,11.25,22.5,33.75,45]:
 theta=math.radians(degree);factor=math.cos(theta)+(math.sqrt(2)-1)*math.sin(theta);rows.append({'angle':degree,'costAtUnitRadius':factor,'radiusAtUnitCost':1/factor})
print(json.dumps({'assumptions':['flat paper height','constant film and floor','sufficient relaxation iterations','8-neighbor lengths 1 and sqrt2','before UNORM8 cost quantization'],'metric':'max(abs(dx),abs(dy))+(sqrt(2)-1)*min(abs(dx),abs(dy))','angularSamples':rows,'maxRadialShortfallPercent':100*(1-1/(math.cos(math.pi/8)+(math.sqrt(2)-1)*math.sin(math.pi/8)))},indent=2))
