Qref1/2 finite KM на physical22 (noGPU)

На белой подложке для слоя optical absorption L=K*d, scattering Q=S*d:
h=sqrt(L(L+2Q)), e=exp(-h), z=1-exp(-2h), denominator=(L+Q)z+h(1+e²), R=Qz/denominator,T=2he/denominator; W=R+T²/(1−R). d=0 =>1; K0=>1 наwhite при любомS; K,S>=0 даёт passiveW0..1 иWnonincreasingwithmass. Это finitewholelayer, НЕ opaqueoverC инеexcesslayerafterlegacyfloor.

Reference mRef=.5max(strength,.004), Aref=1-exp(-mRef*tint/.54), Wref=1−Aref*(1−exp(-tauHere)). ДляGLOBALQref1или2 numericalinverse K(y) подбираетсяOFFLINE для W(K,Qref,1)=exp(-y), y=-lnWref0..ln50. Один globalpolynomialK=y*P15(y) фиксировандлявсехpalette/cases. Degree16 ChebyshevClenshaw, float32explicit CPU. Никакихperpixelinverseiteration/lookup/LUT/perfixturefitting. Runtime forwardlayer uses d=pigmentMass/mRef иK(y)*d,Qref*d.

Различие с Beer-reference05: Beer W=Wref^d уходит0. KM thick limit Winf=S/(K+S+sqrt(K(K+2S)))>0 приS>0,K>0. Это floor калиброванной scatteringmodel, НЕoriginal paintCfloor. ПриstrongerQrefиinversecalibratedK thicklimit способен подсветитьthickpeaks, preservingreferenceexactapprox. Ordinarymassreference тонтотже; thinfilm slope можетотличаться,8контрольнужен. Нулевойmassветкасохраняетlegacydensity0; whitepigmentK0 white нечернит.

Runtime RGB reencode: alpha=1−min(Wr,Wg,Wb), paint=(W−(1−alpha))/alpha. Тогда0<=paint<=1, premultq=W−(1−alpha) удовлетворяет0<=q<=alpha, blankalpha0 white. Coverage/grain/existingopacity умножаютalpha afterward. Это не rigorousspectralKM для mixtures; currenttauRGB geometricmix самонеперенесётK/S additivity,7controlrequired.

CPU global10001y иactualpalette10k randomgeometric mixtures×3channels:
Q1 degree12err1.591e-4, degree16global2.444e-5/actualpalette2.446e-5.
Q2 degree12err6.136e-5, degree16global1.785e-5/actualpalette1.789e-5.
Обаdegree16 монотонныK, passive0..1, nonincreasingmass, RGBpremultboundsPASS. Q1 документированglobalreferenceerror<=2.5e-5 (неclaim2e-5). Float32 Clenshaw каждыйoperationround, неFMA; GLSLcompiler можетиспользоватьFMAиactualGPUproofrequired. DomainBref>=.02 inheritedexplicitclamp; палитрареальногоproduction16swatches иgeometricmixtureswithinboundedtau.

Spec inherits physical22 only, reference05/oldoriginalfloor overlay отсутствует. Shader sequentialanchoraudit8programsPASS. Physicalfields/source22 identical; only compositedensity/paint replacedonce. Degree16 inlineClenshaw largecode/ALU рискAdrenocompile, noGPU доrootreview. Wrongscatterbetterpromise отсутствует.
