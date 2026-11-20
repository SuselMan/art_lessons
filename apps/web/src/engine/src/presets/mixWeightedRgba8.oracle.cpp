// Fixture generator: instantiate the pinned upstream KoMixColorsOpImpl.h with
// the integer RGBA8 trait. Supply its include directory using -I. QtGlobal and
// abstract-interface shims must not replace the mixing implementation itself.
#include "KoMixColorsOpImpl.h"
#include <array>
#include <iostream>
#include <vector>
struct Rgba8Trait {
    using channels_type = quint8;
    static constexpr int channels_nb = 4, alpha_pos = 3, pixelSize = 4;
    static const quint8* nativeArray(const quint8* p) { return p; }
    static quint8* nativeArray(quint8* p) { return p; }
};
int main() {
    KoMixColorsOpImpl<Rgba8Trait> mixer;
    uint32_t state = 0x731ac042;
    const auto next = [&]() { state ^= state << 13; state ^= state >> 17; state ^= state << 5; return state; };
    std::cout << "[";
    for (int c = 0; c < 256; c++) {
        int count = c % 2 ? 4 : 2, sum = 0;
        std::vector<std::array<quint8, 4>> pixels(count);
        std::vector<qint16> weights(count);
        std::vector<const quint8*> pointers(count);
        for (int i = 0; i < count; i++) {
            for (int ch = 0; ch < 4; ch++) pixels[i][ch] = next() & 255;
            if (c % 5 == 0) pixels[i][3] = 0;
            if (c % 7 == 0) pixels[i][3] = 255;
            weights[i] = next() & 255;
            sum += weights[i]; pointers[i] = pixels[i].data();
        }
        int normalizer = c % 3 ? (sum ? sum : 1) : 255;
        quint8 out[4] = {};
        mixer.mixColors(pointers.data(), weights.data(), count, out, normalizer);
        if (c) std::cout << ",";
        std::cout << "{\"pixels\":[";
        for (int i = 0; i < count; i++) {
            if (i) std::cout << ","; std::cout << "[";
            for (int ch = 0; ch < 4; ch++) { if (ch) std::cout << ","; std::cout << int(pixels[i][ch]); }
            std::cout << "]";
        }
        std::cout << "],\"weights\":[";
        for (int i = 0; i < count; i++) { if (i) std::cout << ","; std::cout << weights[i]; }
        std::cout << "],\"normalizer\":" << normalizer << ",\"expected\":[";
        for (int ch = 0; ch < 4; ch++) { if (ch) std::cout << ","; std::cout << int(out[ch]); }
        std::cout << "]}";
    }
    std::cout << "]\n";
}
