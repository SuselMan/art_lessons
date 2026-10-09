# DEV mutation authority: только проверка неизменности

captureDiagnosticAuthority создаёт opaque owner-bound token с existing snapshot и приватной revision. Tracking включается только после успешного explicit capture. Каждый deposit/drain/commitPending/dropPending/prune/forgetLayer/clear консервативно инвалидирует authority один раз, включая no-op. Private peak/bounds writes происходят внутри этих mutators; cell scans/allocations/clocks для revision не добавляются. Обычные reads и независимые fork mutations live authority не меняют.

validateDiagnosticAuthority потребляет capability при любой попытке; foreign instance, forged schema, изменённая модель и повторное использование отвергаются. Точный snapshot/fork прежнего API сохраняется, даже когда validation rejected. Token schema version не content revision; приватный счётчик не характеристика количества воды.

Это prerequisite будущей guarded promotion, а не install/merge/material ownership. Engine/Room/runtime не подключены. Нет обещания атомарной публикации, GPU capture или живого UX ускорения.
