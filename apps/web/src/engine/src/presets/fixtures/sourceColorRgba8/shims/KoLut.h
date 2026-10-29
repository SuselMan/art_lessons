#pragma once
namespace Ko{template<class F,class T,class I>struct FullLut{T operator()(I i)const{return F{}(i);}};}
