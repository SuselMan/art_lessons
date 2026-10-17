# #748: независимый CPU oracle первого расходящегося native unit18

Использованы только уже сохранённые приватные массивы Intel/Samsung: matched outward17, outward18 и post-stitch coverage. Новых GPU-запусков, readback или правок shader/runtime не было. Совпадение исходников между захватами проверяет основной QA manifest; отдельное изменение persistent backing не меняет математику.

## Почему здесь возможен точный byte oracle

Synthetic fixture использует готовую `paper:'flat'`: paperLoader создаёт константную 2×2 height255/catch128 texture. Coverage после stitch имеет только alpha0/255, native unit параметры: dry48, costMax100, climb30, floor.85, stride1/S1, foreign отсутствует. Поэтому height difference ноль, relief1, noise не влияет на edge. Квантованные прибавки cost byte при идеальном round-nearest:

| Сосед | wet | dry |
|---|---:|---:|
| axis | 3 | 122 |
| diagonal | 4 | 173 |

Oracle для каждого пикселя берёт minimum его cost byte и допустимых соседских cost byte+прибавка, насыщает255; сосед255 и выход за physicalfield исключаются. G=255, B копируется из center, A=255. Round(min) монотонен, поэтому integer минимум эквивалентен идеальной float формуле именно этого ограниченного случая. Half-tie нет: ближайший порог отделён на.05byte. Это не oracle для фактурной бумаги, fractional coverage, другого stride/стоимости или общей акварельной модели.

## Фактическое сравнение2048×1536

Оба устройства имеют одинаковые input17 и coverage:

- pressure17 SHA256 `427a8d811c15ec60c3e6d17f1c49e0e5c417089368567a8664b0250b38201b76`.
- coverage SHA256 `df8f0ffb4a0500bd32359b554d4426bbb1c1dfc94d40aefadb0aed72acc792ac`.
- oracle18 SHA256 `9fc03fba47fb6e57e13af44270541370334aac9ea26e810f8f2f94d4df65d3a7`.

Intel actual18 совпадает с oracle по всем RGBA bytes. Samsung actual18 SHA256 `26f3e1e35afbfde28e5f3ef05a3791fba57e7ef660c7e753629e7560af28ea0c`: расходятся2594R channels, все ровно−1 против oracle; G/B/A совпадают. Первый пример GL(x1260,y1199): Samsung102, oracle103, center120, coverage alpha255.

Это воспроизводит весь известный first18 crossGPU diff без GPU и исключает фактурную бумагу/noise как необходимую причину в этом fixture. Ещё не доказывает, что причина именно lowp sampler: sampler/highp, normalized byte decoding, фактический state/addressing и output conversion различаются отдельными QA controls. Sampler highp сам по себе не является универсальным portable-math доказательством.

Три Node CPU теста PASS: exhaustive255sourcecodes×4edgeclasses с точной rational арифметикой/отсутствием half-ties, две float32 группировки, 2D границы/sentinel и отказ от fractional coverage. Малый test-only oracle и compact numeric summary остаются во внешнем `748-native-unit-arithmetic`. В Git нет raw/base64 массивов, приватных URL или секретов. Собственные процессы завершены, временных ресурсов/GPU нет.
