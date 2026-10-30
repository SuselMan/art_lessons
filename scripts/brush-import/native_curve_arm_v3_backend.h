// Source-version mapped ARM64 binary64 arithmetic; no ISA auto-dispatch.
// Authored helpers plus explicit Eigen source guards; upstream patches retain MPL-2.0.
#pragma once
#include <cmath>
#include <stdexcept>
#include <string>
namespace grafetto_curve_arm {
inline void branch(const char*,long,long) {}
[[noreturn]] inline void reject(const char* id){throw std::runtime_error(std::string("unsupported-source-branch:")+id);}
inline double fusedAddProduct(double a,double b,double c){return std::fma(a,b,c);}
inline double fusedSubtractProduct(double d,double a,double b){return fusedAddProduct(-a,b,d);}
inline double separateSubtractProduct(double d,double a,double b){const double product=a*b;return d-product;}
template<class Matrix,class Vector,class Output> inline void oneRowDot(const Matrix& b,const Vector& u,Output& l){
 if(b.rows()==0)return;
 if(b.rows()!=1 || b.cols()<1 || b.cols()>4)reject("one-row-dot-dimensions");
 double accumulator=0.0;
 for(long k=0;k<b.cols();++k)accumulator=fusedAddProduct(double(u[k]),double(b(0,k)),accumulator);
 l[0]=accumulator+0.0;
}
template<class Global,class Perm> inline void columnCheckpoint(long,const Global&,const Perm&){}
template<class Vector> inline void solveCheckpoint(const char*,const Vector&){}
template<class Matrix,class Vector,class Output> inline void columnUpdate(const Matrix& a,const Vector& u,Output& l){
 branch("column-bmod-within-product",a.rows(),a.cols());
 const long rows=a.rows(),cols=a.cols();
 if(rows==0) return;
 if(a.innerStride()!=1 || u.rows()!=cols || u.cols()!=1 || l.rows()!=rows || l.cols()!=1 || l.innerStride()!=1) reject("column-bmod-layout-unproved");
 if(rows==1 && (cols>=1 && cols<=3)){
  double accumulator=double(a(0,0))*double(u(0,0));
  if(cols==2) accumulator=fusedAddProduct(double(a(0,1)),double(u(1,0)),accumulator);
  if(cols==3){const double p1=double(a(0,1))*double(u(1,0));const double p2=double(a(0,2))*double(u(2,0));accumulator=accumulator+p1;accumulator=accumulator+p2;}
  l(0,0)=double(l(0,0))-accumulator;
  return;
 }
 if(!((rows==2 && cols>=1 && cols<=3)||(rows==4 && cols==1)||(rows==3 && (cols==1 || cols==2)))) reject("column-bmod-within-product-unproved");
 const long packetRows=rows-rows%2;
 for(long row=0;row<rows;++row){
  double accumulator=0.0;
  for(long col=0;col<cols;++col){
   if(row<packetRows) accumulator=fusedAddProduct(double(a(row,col)),double(u(col,0)),accumulator);
   else {const double product=double(a(row,col))*double(u(col,0));accumulator=accumulator+product;}
  }
  l(row,0)=fusedAddProduct(accumulator,-1.0,double(l(row,0)));
 }
}
}
