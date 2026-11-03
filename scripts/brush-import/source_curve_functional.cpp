// Explicit source-functional coefficient provider. No native ISA identity claim.
#include "source_curve_functional_backend.h"
#include "native_curve_common.h"
#include "source_curve_functional_build.h"
#include <cfenv>
#include <iomanip>
#include <iostream>
#include <limits>
#include <string>
#if EIGEN_WORLD_VERSION != 3 || EIGEN_MAJOR_VERSION != 5 || EIGEN_MINOR_VERSION != 0 || EIGEN_PATCH_VERSION != 1
#error This mapped profile requires actual Eigen5.0.1
#endif
#if defined(__FAST_MATH__) || defined(EIGEN_VECTORIZE) || !defined(GRAFETTO_CURVE_SOURCE_FUNCTIONAL_PANEL)
#error Functional provider requires locked scalar source arithmetic and panel overlay
#endif
static_assert(sizeof(double)==8 && std::numeric_limits<double>::is_iec559 && std::numeric_limits<double>::digits==53);
static_assert(sizeof(Eigen::Index)==8);
static constexpr const char* PROFILE="eigen-5.0.1-source-functional-f64-v1";
using namespace grafetto_curve;
struct SourceCurveArithmetic {
 static double intercept(double y,double slope,double x){const double product=slope*x;return y-product;}
};
int main(int argc,char** argv){
 try{
  if(std::fesetenv(FE_DFL_ENV)!=0 || std::fesetround(FE_TONEAREST)!=0 || std::fegetround()!=FE_TONEAREST)throw std::runtime_error("Invalid floating-point environment");
  if(argc==2 && std::string(argv[1])=="--describe"){
   std::cout<<"{\"profile\":\""<<PROFILE<<"\",\"buildId\":\""<<GRAFETTO_CURVE_BUILD_ID<<"\",\"input\":{\"minimumKnots\":2,\"maximumKnots\":32,\"maximumCurves\":64,\"maximumTotalKnots\":4096,\"cornerEndpoints\":false}}\n";
   return 0;
  }
  if(argc!=1)throw std::runtime_error("Unknown compiler argument");
  int count=0,total=0;
  if(!(std::cin>>count)||count<1||count>64)throw std::runtime_error("Invalid curve count");
  std::vector<std::vector<Knot>> batch(count);
  for(auto& knots:batch){
   int size=0;
   if(!(std::cin>>size)||size<2||size>32||(total+=size)>4096)throw std::runtime_error("Curve work budget exceeded");
   for(int i=0;i<size;++i){
    double x,y;int corner;
    if(!(std::cin>>x>>y>>corner)||!std::isfinite(x)||!std::isfinite(y)||x<0||x>1||y<0||y>1||(corner!=0&&corner!=1)||(!knots.empty()&&x<=knots.back().x))throw std::runtime_error("Invalid curve knot");
    knots.push_back({x,y,bool(corner)});
   }
   if(knots.front().corner||knots.back().corner)throw std::runtime_error("Unsupported endpoint corner");
  }
  std::cin>>std::ws;
  if(!std::cin.eof())throw std::runtime_error("Trailing curve input");
  std::vector<std::vector<Polynomial>> compiled;
  for(const auto& knots:batch){
   auto pieces=compileCurve<SourceCurveArithmetic>(knots);
   for(const auto& piece:pieces)for(double value:piece)
    if(!std::isfinite(value))throw std::runtime_error("Nonfinite compiled coefficient");
   compiled.push_back(std::move(pieces));
  }
  // Atomic response: no stdout was written before the entire batch passed guards.
  std::cout<<std::setprecision(17)<<"{\"profile\":\""<<PROFILE<<"\",\"buildId\":\""<<GRAFETTO_CURVE_BUILD_ID<<"\",\"curves\":[";
  for(size_t i=0;i<compiled.size();++i){
   if(i)std::cout<<',';std::cout<<'[';
   for(size_t j=0;j<compiled[i].size();++j){
    if(j)std::cout<<',';const auto&p=compiled[i][j];std::cout<<'['<<p[0]<<','<<p[1]<<','<<p[2]<<','<<p[3]<<']';
   }
   std::cout<<']';
  }
  std::cout<<"],\"panelProducts\":"<<grafetto_curve_source::panelProducts<<",\"panelWork\":"<<grafetto_curve_source::panelWork<<"}\n";
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 2;}
}
