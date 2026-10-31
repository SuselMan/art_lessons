#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdint>
using qreal=double;
#define qAbs std::abs
inline qreal shortestAngularDistance(qreal a, qreal b) {
    qreal dist = fmod(qAbs(a - b), 2 * M_PI);
    if (dist > M_PI) dist = 2 * M_PI - dist;

    return dist;
}

inline qreal incrementInDirection(qreal a, qreal inc, qreal direction) {
    qreal b1 = a + inc;
    qreal b2 = a - inc;

    qreal d1 = shortestAngularDistance(b1, direction);
    qreal d2 = shortestAngularDistance(b2, direction);

    return d1 < d2 ? b1 : b2;
}

template<typename T>
inline T kisDegreesToRadians(T degrees) {
    return degrees * M_PI / 180.0;
}

template<typename T>
inline T kisRadiansToDegrees(T radians) {
    return radians * 180.0 / M_PI;
}


double mix(double a,double b,double t){
 double rotation=a;
 if(a!=b){double a1=kisDegreesToRadians(a),a2=kisDegreesToRadians(b);double distance=shortestAngularDistance(a2,a1);rotation=kisRadiansToDegrees(incrementInDirection(a1,t*distance,a2));}
 return rotation;
}
int main(){double a,b,t;while(scanf("%lf %lf %lf",&a,&b,&t)==3){double v=mix(a,b,t);uint64_t bits;memcpy(&bits,&v,8);printf("%016llx\n",(unsigned long long)bits);}}
