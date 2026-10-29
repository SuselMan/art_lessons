#pragma once
#include "QtGlobal"
#include <string>
#include <cstring>
using QString=std::string;
struct QBitArray{QBitArray()=default;QBitArray(int,bool){}bool isEmpty()const{return true;}bool testBit(int)const{return true;}bool operator==(const QBitArray&)const{return true;}};
struct KoColorSpace{};
class KoCompositeOp{public:struct ParameterInfo{const quint8*srcRowStart=nullptr;quint8*dstRowStart=nullptr;const quint8*maskRowStart=nullptr;int srcRowStride=4,dstRowStride=4,maskRowStride=0,rows=1,cols=1;float opacity=1,flow=1;const float*lastOpacity=nullptr;QBitArray channelFlags;};KoCompositeOp(const KoColorSpace*,const QString&,const QString&){}virtual~KoCompositeOp()=default;virtual void composite(const ParameterInfo&)const=0;static QString categoryMix(){return"mix";}};
