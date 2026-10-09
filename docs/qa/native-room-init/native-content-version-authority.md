# Частичная authority encoded-write версий

DEV `diagnosticContentVersions` по умолчанию OFF. Только при явном opt-in backend создаёт WeakMap: ключ — существующий owned field, значение — счётчик успешных encoded helper writes. GPU ресурсы, fences, Promise и clocks не добавлены. DestroyField удаляет запись; backend.destroy сбрасывает map. Getter всегда возвращает complete=false.

| Реальный producer | Отслеживаемая роль | Момент версии |
|---|---|---|
| upload, queue.writeTexture | destination field | после успешного writeTexture |
| encodeUploadRgba / delegated luminance upload | destination field | после copyBufferToTexture |
| copyRegion / delegated copyField | destination field | после copyTextureToTexture |
| encodeClearField / delegated clearField | destination field | после успешного pass.end |

Версия относится к записанной команде, не к её выполнению/ACK и не к изменившимся пикселям. Нулевые copy/clear регионы и failed helper encoding не объявляются успешными helper writes. Existing static paper/noise epoch не заменён. Переданные собственные ресурсы не копируются и не удерживаются новым strong map.

Пропущены raster stamp/ribbon attachments, dispatcher/fieldOp outputs, paired brush и copybacks, live/finish composite outputs, прямые encoder writes вне перечисленных helpers. Даже неизменённый knownEncodedWrites не доказывает неизменность material contents. Ownership identity passport не читает эти counters как разрешение раннего admission. COW/reorder остаётся HOLD; следующий полный coverage требует authority на этих producers, а не только стабильного field pointer.

AST census сохранён в native-backend-method-census.json: 49 существовавших own methods/accessors/constructor, 51 после двух новых helper methods. Это точное число текущего класса, не предполагаемые 64 и не полный граф GPU API. Девять методов класса самостоятельно submit; Room также использует adapter/pass encoders напрямую, поэтому class census не закрывает всю write authority.

CPU tests используют реальные backend helper методы с fake GPU encoder: same-field clear, destination-only copy, staging/direct upload, empty ranges, failed pass.end, OFF path, field/backend destruction. Shader execution, байтовая immutable parity и physical GPU completion этим не доказаны.
