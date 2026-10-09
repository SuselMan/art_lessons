# Парное положительное перемещение: математический вывод

Это офлайн вывод, не новая реализация. Canonical акварель не меняется. Actual high128 показал390 отрицательных P/C-mass texels, минимум−0.03905, добавку componentwise clamp5.53064 к ROI mass279.1943 (+1.98%). Сырые high P/C не сохранены, поэтому следующий synthetic oracle не является экспериментом над actual полем. Финальный кадр после полного reveal остаётся OPEN.

## Почему одного limiter недостаточно

Пусть B_i — восемь положительных source moments (P/C), D_i — transported-low minus initial-low. Общий множитель λ_i=min(1,min_{D_ik<0} B_ik/−D_ik) обеспечивает B_i+λ_iD_i≥0 и exact identity при D=0. Он устраняет независимые множители каналов, но сумма λ_iD_i вообще не ноль. Даже для одного цвета synthetic пример даёт mass1.15 вместо1.0 — такую же добавку, что обычный clamp. Для нескольких цветов общий λ не гарантирует неизменный hue: delta после независимого квантования P/C уже может не представлять допустимую смесь.

Один λ для всех texels сохраняет sum(D)=0, однако один source-zero texel с отрицательной delta делает глобальный λ=0. В примере это полностью останавливает анимацию. Следовательно, positivity, сохранение массы и достаточно живое движение нельзя гарантировать этим residual limiter одновременно.

## Конструктивный вариант

Нужен общий оператор перемещения T: T_ij≥0, sum_i T_ij=1. Применяем его к каждому из8 исходных moments: V'_ik=sum_j T_ij V_jk. Это сохраняет положительность и массу каждого канала. Для одного пигмента C.rgb=k*C.a отношения сохраняются. Для смеси отношение нового C.rgb/C.a — взвешенная смесь donor ratios, поэтому остаётся в их выпуклой оболочке. При T(0)=I сохраняется detail исходного high source без subtraction blurred source.

Практический кандидат — локальный конечный объём/общие donor fractions, ограниченные доступной массой до переноса. Одни и те же доли применяются к P/C. Нельзя отдельно переносить/обрезать color channels. Сухие барьеры/связность луж должны запрещать соответствующие рёбра T. Движение может управляться smooth128 water/velocity, но перенос high moments нужен для сохранения их деталей. Это настоящее движение краски, не alpha dissolve.

## Цена и ограничения1024

1024² pairedRGBA32F moments —32MiB. Ping-pong двух пар —64MiB дополнительных GPU targets; необязательная ещё одна immutableFloat pair —32MiB. При переиспользовании существующего immutableQ8 source его копия не нужна. Четыре high-resolution float donor coefficients добавляют16MiB, если хранить; вычисление в shader экономит эту память ценой повторных вычислений. Dense T не подходит: приблизительно4TiB только коэффициентов. Sparse local stencil занимает O(N) памяти/времени.

При5tap stencil дваRGBA32F выхода читают примерно160MiB и пишут32MiB на один полный1024 step (нижняя оценка, без flow/paper/filter/state costs).60 steps/s —не меньше11.25GiB/s трафика. Это оценка, не измеренный Surface performance. Bounding connected wet support, lower update cadence и отдельная display interpolation могут сократить работу. WebGL1 потребует два output passes для paired fields; другие backend могут уменьшить повторение работы, но здесь speedup не доказан.

Inverse warp source sampling может быть дешевле и identity-preserving, но без Jacobian не сохраняет массу. С Jacobian сохраняет массу в непрерывной модели; дискретный point sampling, foldovers и dry barriers всё равно требуют проверки. Нельзя выдавать этот вариант за exact conservative transport.

Даже математическое T(0)=I не доказывает byte-exact materialRGBA после копирования Q8→Float32 и повторного composite: нужен существующий wholeviewport t0 gate. Canonical endpoint и final handoff/reveal проверяются независимо. Перед новой реализацией нужно согласовать ресурсный бюджет и выбрать bounded preview support.
