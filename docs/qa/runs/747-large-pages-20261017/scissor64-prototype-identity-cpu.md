# #747: CPU-проверка классов буферов QA scissor64

Внешний QA-only installer исправлен после обнаруженного несовпадения импортированного класса и фактических field buffers. Продуктовые kernels и runtime этим отчётом не изменяются; GPU-проверку ведёт отдельный оператор.

Delta: `prototype-identity.patch`, SHA256 `01850dd103c2117f9bd0c49c6dfd5b7c7aabd31d48bc6d1812c27fd3239987c1`. Итоговый installer SHA256 `4d63349f956221200c74f9206a96115777e3c72333ef1b85bd9fc6ed1648e4d3`.

Installer регистрирует импортированный prototype и `Object.getPrototypeOf` каждого фактического field buffer. Для каждого сохраняется исходный property descriptor; восстановление идёт в обратном порядке. Отсутствующий FBO-owner остаётся явной ошибкой: неизвестный третий класс prefix buffer не принимается молча.

## Проверки

- 7 Node mock-тестов PASS: прежние проверки ролей/state/alias/exception, два разных класса imported/actual, prefix draw фактического класса, точное восстановление обоих descriptors, fail-closed для неизвестного третьего класса.
- Повтор actual production Plan на MockGL, approved M70 r40/S1, paired colour, splitQuanta/locked: PASS. Импортированный prototype намеренно принадлежит другому классу. Выполнены 199 оригинальных draw и 199 предварительных clear, из них 16 prefix draw. Подключены и восстановлены 2 prototypes; ownership restoration exact.
- Роли clear: ZERO132, inward R0/A1 —23, outward R1/A1 —28, packedFF —16. Неожиданных destination aliases и пропущенных tracked draws не было.
- Node syntax check PASS. Полный actual shader source и математические drawcalls не заменялись; ops functions и WeakMap tags не оборачивались.

Это проверка маршрутизации и lifecycle на CPU mocks. Она не исполняет GLSL, не доказывает pixel parity и не измеряет GPU-производительность. Численная scissor64-проверка на устройстве остаётся отдельным gate.

Малые исходники тестов и логи сохранены во внешнем review-каталоге `747-scissor64-prototype-identity-delta`; приватных массивов и URL в Git нет. Собственный тестовый процесс завершён, временных служб, браузеров и dependency copies не создано.
