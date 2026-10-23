# Natural Room mixed route — подготовка, не аппаратный PASS

Источник 57713c66 (root-compatible ADD default OFF); использовать обычную Room с текущим server/shared passport. Stand5331 сейчас standalone без backend proxy: сначала отдельный согласованный proxy/current backend, без изменения защищённых портов.

1. Собственная новая физическая640×480 Room через проверенный create/join helper из728-pending-paper-dry/temp/multiplayer/matrix.mjs. Проверить Room metadata, paper loaded, active layer, GL0 и выбранный watercolor tool в Room store.
2. Инъекция tracked apps/web/scripts/devices/pageLib.js и natural-two-colour-function.js. Два настоящих pointer/rAF жеста красный/синий64 на перекрывающихся точках одного слоя; preset100:100. Подготовленный helper не изменяет source поля и возвращает оригинальные операторы ровно один раз.
3. Обязательные actual metadata paints>1, mode16 с mobile P/V, same washID, две разные recorded preset colours, все native ops serverACK. Cost-domain guard намеренно singlePaint-only: не заявлять, что mixed включает connected mask.
4. После finish ordered UI Dry с ACK; canonical PNG с ненулевой alpha; Undo/Redo и fresh replay той же полной записи. WholeRGBA сравнивать строго, native output сохранить до fresh. OFF/ON fixed journal replay сравнивать отдельно от адаптивных native gestures.
5. Сохранить flags/source/backend/paper/physical dimensions, mode16 counts и временные partial на failure. Один own browser/context, RAMguard500, finally close. Этот файл и helper — CPU preparation; выполнение ещё не разрешено/не проведено.
