# Opt-in CPU preparation: exact QA-only path

`partitionNativeComponents(actual,w,h,observe?,now?,options?)` поддерживает отдельный6-й аргумент. По умолчанию `{mode:'baseline'}`: прежние7clones, backdropcopies и subarray/set scatter. Никакие engine/controller/UI/kernel файлы не изменены. Живой Mini вообще не использует этот CPU component-wrapper; этот результат нельзя выдавать за исправление интерактивного рисования.

Опции:

- `{mode:'fast'}`: те же snapshots/ownership, но5material planes копируются прямыми Uint32-word assignments без per-pixel subarray/set. Word здесь просто4неизменённых байта; численная интерпретация/endian не меняет результат. Для unaligned borrowed view используется4byte assignment fallback.
- Дополнительно `borrowImmutableSource:true`: caller предоставляет все7неизменяемых массивов на весь срок partition/materialize/describe/fork; не делаем лишний28MiB snapshot. Это явный lifetime promise, не автоматическое доказательство неизменности. Caller должен сохранить before/after7SHA вне primarytimer; нельзя параллельно upload/rewrite source.
- `shareImmutableBackdrop:true`: component planes.original/paper — readonly aliases source/snapshot; убираем8MiB копий на компоненту. Fork обязан только читать/upload; уничтожение GPU fork не даёт права менять CPUarrays. Без этой опции materialize возвращает самостоятельные backdropcopies как прежде.
- Borrow/share запрещены вне modefast. Metadata `preparation` явно сообщает ownership и QA-onlyscope. No scope survives asynchronous hashing safely unless caller keeps immutable promise. Describe сам хеширует ownedcopy каждой плоскости, как прежде.

BFS, W=solvent.A+foreign.A>0, order/ranges, independent invariants, pigmentation rule C.any, dryliteral, masks и все7байт unchanged. Fast dryLiteral также не использует subarray/set, но выделяет временный4MiBorder в1024²; primary componentmaterialize этого не делает.

## CPU evidence

8CPU tests PASS: baseline6 regressions;24deterministic random geometries+foreign/diagonal/thin/dry/zeroC; all7planes/masks/dryliteral exact; source nonmutation; aligned/unaligned immutable modes; all original/masked SHA exact; defaultfastcopy still isolated from later caller mutation. StrictTS0.

`fast-prep-vps.json` —3samples/режим, реальные frozen authored7planes mini-wave/two-colors, gzip+7planeSHA verified до замера; output hashes и input nonmutation проверены после. Это VPS CPU, не Samsung, не GPU, не penlatency; порядок не balancedABBA, allocation/GC/JIT влияют. Цель — подтвердить реальное устранение scatterwork, не оценить выигрыш продукта.

Median materialize для всех компонент, мс:

| Вход | Baseline | Fast с прежними copies | Fast + explicit borrow/share |
|---|---:|---:|---:|
| mini-wave | 271.04 | 61.44 | 27.00 |
| mini-two-colors | 382.14 | 38.01 | 30.13 |

Median totalCPUprep (partition+materialize), мс:406.56→161.12→138.53;543.21→187.28→175.48 соответственно. Не переносить эти числа на телефон. Остальные этапы partition, валидации и GPUupload не устранены.

Повторить: `node docs/qa/prototypes/mini-worker/native-component-prep-bench.cjs /absolute/native/report.json /new/output.json`. SourceEvidence должен содержать exact authored7planes manifest, не commoncarrier6MiB. Никакого GPU/сервиса/зависимостей helper не создаёт.
