# Узкий identity-copy: CPU контракт, не внедрение

Проверен текущий native WT 728-bounded-ui-optin: settlePlanAdapter.fieldOp → CanonicalSettleCommands.encode → CanonicalFieldOps.run. **CanonicalBasicFieldPass не является фактическим маршрутом.** В этих трёх точках identity fastpath отсутствует. backend.copyRegion уже кодирует copyTextureToTexture; новый общий copy API не нужен.

Фактический mode1 без world.z использует fit(a+b*k*f), f=1. Источник/второй вход finite rgba8unorm, k=+0 или -0: результат точно исходный Q8 для всех RGBA, включая ненулевой RGB при alpha0. Совпадающие размеры и nearest A дают тот же texel. Линейный фильтр намеренно не допускается, даже если отдельный центр теоретически совпадает.

CPU proposal IdentityFieldCopy.mjs — изолированный helper. validated=true является **внешним сертификатом**, а не доказательством ownership: runtime интеграция обязана сначала выполнить существующие device/alias/finite-uniform/filter проверки, дополнительно owner.live+ownsLiveField, COPY_SRC/COPY_DST usages и формат обоих полей. Не пропускать ошибку вторичного b/c/d/e/path/noise alias только потому, что copy их не читает. Если любой guard неизвестен, обычный shader.

Разрешён только integer bounded GL scissor без clipping: top-down copy origin y=height-y-h. Остальные destination байты сохраняются. Source/destination distinct, mip0/layer0. Не применять к fibre/comb/world, иной format, size mismatch, fractional/outside rect. Не округлять rect ради fastpath.

3 Node tests PASS: 131072 комбинации i/j и ±0 (четыре канала), fake encoder один copy/no shader bind, integer rectangle/outside preservation, unsafe fallbacks/alias. CPU арифметика не заменяет actual shader/Q8 compiler proof. Реальный OFF/ON whole endpoint +10roles обязательны до принятия.

Интеграционный риск: encode сейчас возвращает GPUBuffer, adapter безусловно transient.push. Copy возвращает void; нельзя скрыть это dummy uniform. Нужен небольшой явный union/null контракт и условное retain, сохраняющий counters/timestamp accounting и границы исходного quantum. Не объединять copy с соседними quanta.

Сбережение: только parity-copy shader dispatch/128B uniform/bindgroup/reads. Rim339 и tide340 сохраняют по шесть mode5 blur; существенный gain не заявлен. Никакой canonical формулы, blur/exp, дозы или shader сейчас не изменено.
