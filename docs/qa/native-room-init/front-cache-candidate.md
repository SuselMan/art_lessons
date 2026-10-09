# Следующий кандидат: неизменная геометрия waterFront

Измеренный источник: `68e38ca1`, первый непустой water material job, request 16.
Это выбор направления по стоимости, а не доказанный прирост.

| Работа | Вызовы | GPU spans | Роль |
|---|---:|---:|---|
| waterFront | 240 | 976.290 мс | 216 наружных шагов + 12 внутренних + 12 group-tide шагов |
| brush single | 420 | 437.256 мс | 210 контактных импульсов, два выхода P/C на импульс |

Последовательные диапазоны raw rows: front 15–230, 232–243, 721–732.
Наружный run задаётся `watercolorFrontSteps`, внутренние — `width + 2`.
При radius 200, S=1, ограничение rim width 10 объясняет внутренние 12.
Однако raw timestamp rows не сохраняли actual field dimensions/scissor: нельзя
выдавать 1024² из fixture за непосредственно измеренную площадь каждого pass.
Native owner имеет 1024² window; settle field может быть меньше, S определяется
размером clipped window. Следующий offline oracle должен восстановить actual
geometry из сохранённого packed input, а не подставлять fixture geometry.

`CanonicalWatercolorSettlePlan.frontOps` вызывает adapter.waterFrontStep →
commands → dispatcher.waterFront → compute kernel. Каждый шаг обрабатывает
целый settle field, читает предыдущий Q8 cost и записывает новый Q8 cost.
Group tide повторно строит внутреннюю дистанцию от изменённой coverage.
Контактный brush обрабатывает contact rect + halo одного canonical texel;
два single выхода читают одинаковые pre-pulse P/C и лишь затем копируются назад.
Парный brush — второй кандидат, пока отложен.

## Формула и сохраняемые границы

Для canonical texel q: `px=(qx+0.5,H-qy-0.5)`.

- `h(q)=heightAt(px)` с исходным bilinear/repeat paper sampling.
- `k_c(q)=c*(1+4*smoothstep(0.5,0.64,fbm((px+paperOrigin)*0.025+(41,7))))`.
- `f(q)=smoothstep(0.02,0.15,max(coverage(q).a,foreignWet*foreignFilmLinear(q).r))`.
- Для каждого прежнего соседа: `relief=max(floor*stride,stride+k_c(q)*(h(q)-h(neighbor)))`.
- Прежние min, length, dryCost mix и запись rgba8unorm остаются на каждом шаге.

Предлагается ОДНА оптимизация: bounded rg32float cache `h,k_c` наружного run.
Вычислить их один раз исходными выражениями; остальные 216 шагов заменить
повторные paper/noise calculations на exact texel loads. Сохранить все 240
итераций, прежний порядок, physical Q8 ping-pong, прочие 24 шага без изменения.
Film пока НЕ кешировать: coverage меняется между front и group tide, а input
owner может содержать чужую воду. Его неизменность требует отдельного epoch proof.
Уже существующий diagnostic static cache — основа, не готовое доказательство.

При integer stride и допустимом neighbor UV, соседний `px` совпадает с центром
neighbor texel, включая переворот y. Поэтому повторная интерполяция кеша запрещена:
только textureLoad, исходный paperAt вызывается при заполнении. Проверять UV
до neighbor load точно как исходный kernel; никаких clamp вместо прежнего guard.
Нельзя использовать dyadic jumps: они уже меняли результат из-за Q8/floor.

## До реализации и аппаратного включения

1. Восстановить actual clipped geometry/S/paper uniforms из durable packed input.
   CPU f32 oracle сравнивает исходные sampling expressions и cached addresses
   на этих operand values: edges, negative origin/repeat, non-square paper,
   integer strides и floor/min/Q8 boundary values. При отсутствии geometry
   evidence это остаётся незакрытым gate, не выдуманным actual operand proof.
2. Cache key: device + immutable paper/noise identity/version + geometry,
   origin/texSize/scale + exact climb coefficient + owning material epoch.
   Mutation/foreign-owner unknown, noninteger stride, loss/dispose → fallback
   либо fail closed; не переиспользовать кеш после изменения mutable bindings.
3. Ограничить память `8*W*H` bytes и lifetime одним material owner. После ACK
   уничтожить; не realloc внутри активного encoder. READY precompile отдельный,
   не выдавать перенесённый compilation wait за ускорение GPU.
4. DEV default OFF. CPU tests verify cache hit/miss/key/lifetime and unchanged
   ordered plan. CPU f32 equivalence не доказывает одинаковое WGSL FMA lowering.
5. Затем один разрешённый same-packed OFF/ON material oracle: exact P/C,
   coverage/cost intermediate Q8 bytes и финальный RGBA; GL0/nonlost. Любое
   расхождение блокирует кандидат. GPU compiler rounding нельзя скрывать
   tolerance или сравнением только финального PNG.
6. После quality gate отдельный bounded GPU measurement: cache prep отдельно,
   прежние 240 шагов, count/pixels/labels. Возможный выигрыш пока неизвестен.

Верхняя граница затрагиваемой работы — наружные 216 из 240 front вызовов,
а не обещание убрать 90% времени: texture reads, Q8 input/output и соседний min
остаются. Ни brush, ни scheduling/caps этим кандидатом не меняются.
