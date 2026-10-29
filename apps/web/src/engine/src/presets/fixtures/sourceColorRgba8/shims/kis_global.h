#pragma once
#include "QtGlobal"
#define CLAMP(x,a,b) std::clamp(x,decltype(x)(a),decltype(x)(b))
template<class T>T kisBoundFast(T a,T b,T c){return std::clamp(b,a,c);}
