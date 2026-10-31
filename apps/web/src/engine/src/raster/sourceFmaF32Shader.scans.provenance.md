# Последовательные побитовые проходы finite FMA

Изменены только четыре последовательных scan-loop в SOURCE_FMA_F32_GLSL. Eleven-way sfmaGet selector исключён там, где byte index уже известен из constant-bound loop. Порядок битов, floor/mod/power, quotient accumulation и sticky max сохраняются. Динамический guard sfmaBit(r,shift-1), align/carry/borrow/F32 normalization/rounding не изменены.

Tests-first: два теста RED до rewrite, затем GREEN. Тесты выполняют буквальные scan bodies из emitted GLSL, конвертируя только объявления int/float в JS let. Exhaustive256 значений каждого из11limbs проверяет leading bits; significand boundary/power-of-two pairs проверяют exact48bit products; seeded88bit patterns и shifts−2..90 проверяют quotient/sticky. HOST JS execution не доказывает GPU compiler semantics или производительность; существующие native FMA vectors и SAME143-envelope engine/recovery nativeSHA gate обязательны перед speedclaim.

Исходный Samsung profile (R52/default58-engine-compile-result.json, reviewed index1e33e9e01) показывает COMPILE_STATUS wait710.7+472.3ms initial,685.6+426.5ms recovery, KHR_parallel_shader_compile unavailable. Это основание проверить уменьшение selector expansion, а не измеренный выигрыш этой правки. Шейдеры baseline/candidate должны быть закреплены отдельными SHA в аппаратном A/B. Новых renderer/cache/approximation/таймеров/зависимостей нет.

Проверка реализации: final3scan tests PASS; четыре FMA/RGB suite14tests PASS до дополнительного mantissa-case; oxlint/diff-check PASS. Joint app+service-worker TypeScript65944 terminal PASS на scheduler229db3b17 +этих трёх frozen paths. Аппаратный candidate gate остаётся отдельной обязательной проверкой.
