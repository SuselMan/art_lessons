// Authored natural cubic constraint compiler. Eigen is an external dependency.
// Canonical candidate: Eigen3.4.0 SparseLU, binary64, FP contraction disabled.
#include <Eigen/Sparse>
#if EIGEN_WORLD_VERSION != 3 || EIGEN_MAJOR_VERSION != 4 || EIGEN_MINOR_VERSION != 0
#error This curve profile requires Eigen3.4.0
#endif
#ifdef __FAST_MATH__
#error Fast-math is incompatible with the explicit curve profile
#endif
#include <array>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

#include "native_curve_common.h"
using namespace grafetto_curve;
struct LegacyCurveArithmetic {
    static double intercept(double y,double slope,double x){return y-slope*x;}
};
int main() {
    try {
        int count = 0, total = 0;
        if (!(std::cin >> count) || count < 1 || count > 64) throw std::runtime_error("Invalid curve count");
        std::vector<std::vector<Knot>> batch(count);
        for (auto& knots : batch) {
            int size = 0;
            if (!(std::cin >> size) || size < 1 || size > 256 || (total += size) > 4096) throw std::runtime_error("Curve work budget exceeded");
            for (int i = 0; i < size; ++i) {
                double x, y; int corner;
                if (!(std::cin >> x >> y >> corner) || !std::isfinite(x) || !std::isfinite(y)
                    || x < 0 || x > 1 || y < 0 || y > 1 || (corner != 0 && corner != 1)
                    || (!knots.empty() && x <= knots.back().x)) throw std::runtime_error("Invalid curve knot");
                knots.push_back({x, y, bool(corner)});
            }
        }
        std::cin >> std::ws;
        if (!std::cin.eof()) throw std::runtime_error("Trailing curve input");
        std::vector<std::vector<Polynomial>> compiled;
        for (const auto& knots : batch) compiled.push_back(compileCurve<LegacyCurveArithmetic>(knots));
        std::cout << std::setprecision(17) << '[';
        for (size_t i = 0; i < compiled.size(); ++i) {
            if (i) std::cout << ',';
            std::cout << '[';
            for (size_t j = 0; j < compiled[i].size(); ++j) {
                if (j) std::cout << ',';
                const auto& p = compiled[i][j];
                std::cout << '[' << p[0] << ',' << p[1] << ',' << p[2] << ',' << p[3] << ']';
            }
            std::cout << ']';
        }
        std::cout << "]\n";
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 2; }
}
