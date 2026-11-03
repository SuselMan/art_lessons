// Authored bounded implementation of pinned Eigen5 SparseLU L = B * U.
// Functional binary64 source law; deliberately NOT an ARM64 instruction mapping.
#pragma once
#include <cmath>
#include <cstdint>
#include <stdexcept>
namespace grafetto_curve_source {
inline std::uint64_t panelProducts=0,panelWork=0;
template<class Matrix,class Upper,class Output>
inline void panelProduct(const Matrix& b,const Upper& u,Output& l){
 const long rows=b.rows(),depth=b.cols(),cols=u.cols();
 if(rows<0||rows>124||depth<1||depth>124||cols<1||cols>124||u.rows()!=depth||l.rows()!=rows||l.cols()!=cols
    ||b.innerStride()!=1||u.innerStride()!=1||l.innerStride()!=1
    ||b.outerStride()<rows||u.outerStride()<depth||l.outerStride()<rows)
  throw std::runtime_error("unsupported-source-branch:functional-panel-layout");
 const std::uint64_t work=std::uint64_t(rows)*std::uint64_t(depth)*std::uint64_t(cols);
 if(panelProducts>=65536||work>16*1024*1024-panelWork)throw std::runtime_error("Functional panel work budget exceeded");
 panelWork+=work;++panelProducts;
 // Overwrite only initialized logical L entries. Never touch stride padding,
 // gather/scatter U, or fuse the caller's later dense_col -= L operation.
 // The locked build disables contraction/vectorization and reassociation.
 for(long col=0;col<cols;++col)for(long row=0;row<rows;++row){
  double sum=0.0;
  for(long k=0;k<depth;++k){const double product=double(b(row,k))*double(u(k,col));sum=sum+product;}
  if(!std::isfinite(sum))throw std::runtime_error("Nonfinite functional panel product");
  l(row,col)=sum;
 }
}
}
