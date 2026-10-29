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

struct Knot { double x, y; bool corner; };
using Polynomial = std::array<double, 4>;
static std::vector<Polynomial> compile(const std::vector<Knot>& knots) {
    if (knots.size() == 1) return {{{0, 0, 0, knots.front().y}}};
    if (knots.size() == 2) {
        const double slope = (knots[1].y - knots[0].y) / (knots[1].x - knots[0].x);
        return {{{0, 0, slope, knots[0].y - slope * knots[0].x}}};
    }
    const int intervals = int(knots.size()) - 1, dimension = intervals * 4;
    std::vector<Eigen::Triplet<double>> entries;
    entries.reserve(dimension * 4);
    Eigen::VectorXd targets = Eigen::VectorXd::Zero(dimension);
    int equation = 0;
    auto value = [&](int piece, const Knot& knot) {
        const double square = knot.x * knot.x;
        const std::array<double, 4> powers{square * knot.x, square, knot.x, 1};
        for (int j = 0; j < 4; ++j) entries.emplace_back(equation, piece * 4 + j, powers[j]);
        targets[equation++] = knot.y;
    };
    for (int piece = 0; piece < intervals; ++piece) {
        value(piece, knots[piece]); value(piece, knots[piece + 1]);
    }
    auto derivative = [&](int piece, double x, int order, double sign) {
        // Preserve explicit zero entries: SparseLU's symbolic matrix includes them.
        if (order == 1) {
            const double square = x * x;
            entries.emplace_back(equation, piece * 4, sign * (3.0 * square));
            entries.emplace_back(equation, piece * 4 + 1, sign * (2.0 * x));
            entries.emplace_back(equation, piece * 4 + 2, sign);
        } else {
            entries.emplace_back(equation, piece * 4, sign * (6.0 * x));
            entries.emplace_back(equation, piece * 4 + 1, sign * 2.0);
        }
    };
    derivative(0, knots.front().x, 2, 1); ++equation;
    derivative(intervals - 1, knots.back().x, 2, 1); ++equation;
    for (int knot = 1; knot < intervals; ++knot) {
        const double x = knots[knot].x;
        if (knots[knot].corner) {
            derivative(knot - 1, x, 2, 1); ++equation;
            derivative(knot, x, 2, 1); ++equation;
        } else {
            derivative(knot - 1, x, 1, 1); derivative(knot, x, 1, -1); ++equation;
            derivative(knot - 1, x, 2, 1); derivative(knot, x, 2, -1); ++equation;
        }
    }
    if (equation != dimension) throw std::runtime_error("Invalid constraint dimensions");
    Eigen::SparseMatrix<double> matrix(dimension, dimension);
    matrix.setFromTriplets(entries.begin(), entries.end());
    Eigen::SparseLU<Eigen::SparseMatrix<double>> solver(matrix);
    if (solver.info() != Eigen::Success) throw std::runtime_error("Curve factorization failed");
    const Eigen::VectorXd solution = solver.solve(targets);
    if (solver.info() != Eigen::Success || !solution.allFinite()) throw std::runtime_error("Curve solution failed");
    std::vector<Polynomial> result(intervals);
    for (int i = 0; i < dimension; ++i) result[i / 4][i % 4] = solution[i];
    return result;
}
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
        for (const auto& knots : batch) compiled.push_back(compile(knots));
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
