# Узкий эксперимент: pressure-directed перенос + симметричная диффузия

Только предложение для CPU visual prototype. SAME actual capture, source P/C, full wet/support, g=0.023421498890197356, 12 macrosteps ×64 unit substeps; canonical неизменён. Никакой переменной водной capacity: w=1 — effective mathematical capacity.

## Driver и физический смысл

Поле pressure.r текущего solver — нормированная arrival cost, а не гидродинамическое давление. В существующем carry допустим перенос к большей cost (delta>0 и source path flag); знак −grad, обычный для физического pressure, здесь направил бы пигмент обратно к центру. Поэтому предлагаемое направление **+grad cost** означает продвижение по разрешённому фронту, не физическую модель потока воды. Если требуется настоящий pressure-flow, текущих данных недостаточно.

На полном128 поле вычисляем центральные разности в world units: grad=(cost(x+1)-cost(x-1), cost(y+1)-cost(y-1))/16. На границе односторонние разности. Затем bilinear interpolation двух компонент в world pixel centres (world/8−0.5); не интерполировать угол или нормализованные векторы. Направление v=grad/|grad| при |grad|>1e−8, иначе0. Жёсткий порог зафиксирован заранее, но нормализация near-flat field остаётся риском; flat-region diffusion сохраняется при v=0.

Wet/corner support и source path admission те же, что в actual adapter: ни одной диагонали через сухой ортогональный угол; arrival cost band проверяется по полному полю. На ROI-boundary любой положительный outward donor — explicit fallback, не поглощение и не замороженная граница.

## Два независимых оператора

Заранее фиксируем равное разделение прежнего g: gA=gD=g/2. Это новая модель, не exact optimization прежнего calibration. Не подбирать gain после изображения. Для unit directions e_d и angular weights a_d=.2 axis/.05 diagonal:

Advection donor fractions A_i,d = gA * a_d * max(dot(v_i,e_d),0). Не renormalize после wet/path veto. Сумма <=gA, поскольку сумма a_d=1. Общий conservative scatter для всех8 моментов. Пигмент не определяет направление/скорость; high-local source участвует только в переносимой массе.

Diffusion faces D_ij = gD*a_d*min(s_i,d,s_j,opposite), где s — бинарный wet/path eligibility. D_ij=D_ji. Применяем m'_i=m_i+Σ_j D_ij(m_j−m_i) покомпонентно ко всем8 моментам. Никакого coarse currentP gradient. На w=1 high-local разность даёт симметричный exchange; это обычная локальная diffusion, не gaussian post-blur.

Один unit substep: сначала A scatter, затем D exchange. Последовательный split явно имеет порядок O(dt²) локальной ошибки и не равен сумме старых fractions. Оба шага используют immutable input своего оператора; update in-place запрещён. Макрошаг пересчитывает actual evolving front, направление из нового full cost; внутри64 substeps driver frozen, ограничение явно сохранено.

## Что доказуемо и что проверять

Для каждого оператора outflow<=g/2<1: positivity и CFL; closed-domain face cancellation сохраняет массу каждого из8 каналов. Общие fractions сохраняют ratio color как convex mixture, не вводят channelwise hue clamp. Diffusion при w=1 doubly stochastic: constant stationarity и density maximum principle. Advection column stochastic, но compression rowSum может превышать1: **peak может расти**, concentration maximum principle не гарантируется. Нельзя выдавать отсутствие spikes заранее; надо записать rowSum, peak amplification и halo/core вместе с PNG.

Один предписанный CPU запуск против прежнего directed driver и radial causal control: SAME input/time, PNG0/4/8/12; mass/hue/dry/outward/source guards. Метрики M2/h4/peak/coreR8/haloR24 плюс max incoming advection rowSum. Изображение должно показать coherent motion без grid spikes; рост density сам по себе не нарушение консервативности, но может оказаться visualFAIL. Если current cost gradient даёт только stationary diffusion либо неприемлемую компрессию — признать negative result без серии новых gains.

Открытые ограничения: arrival cost не fluid pressure; film alpha не water volume; direction normalisation теряет magnitude; 64 frozen-driver unit substeps не actual animation; optical approximation не Grafetto renderer. Ни один из этих пунктов не скрывать в результате.
