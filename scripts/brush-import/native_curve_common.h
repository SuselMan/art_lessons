// Authored natural-cubic constraint assembler shared by explicit coefficient profiles.
// Eigen is an external dependency; its source/version stays with each provider.
#pragma once
#include <Eigen/Sparse>
#include <array>
#include <cmath>
#include <stdexcept>
#include <vector>
namespace grafetto_curve {
struct Knot { double x, y; bool corner; };
using Polynomial = std::array<double, 4>;
template<class Arithmetic>
static std::vector<Polynomial> compileCurve(const std::vector<Knot>& knots) {
    if (knots.size() == 1) return {{{0, 0, 0, knots.front().y}}};
    if (knots.size() == 2) {
        const double slope = (knots[1].y - knots[0].y) / (knots[1].x - knots[0].x);
        return {{{0, 0, slope, Arithmetic::intercept(knots[0].y,slope,knots[0].x)}}};
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
}
