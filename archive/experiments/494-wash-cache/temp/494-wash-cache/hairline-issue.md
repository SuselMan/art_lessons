Тест e2e/specs/flexibleHairline.spec.ts для watercolor падает: после штриха пером force=0.02 записаны 87 дабов размером 2px, но сечение через pickColor иногда полностью белое.

CI PR #707: первое падение max darkness=2.9999999999999893 при требовании >3, повтор max=0. Локальный Chromium/SwiftShader на исходном b7d2b6a9 (до переноса scratch и cache): max=0, тест упал. Это наблюдение до рефакторинга, причина ещё не установлена.

Нужно установить, исчезает ли реальная линия или тест неверно выбирает место/момент измерения. Не снижать порог без проверки реального рисунка и контрольной поломки. Проверить live, undo/redo, flat paper, субпиксельное расположение линии и время завершения отрисовки.

CI: https://github.com/SuselMan/art_lessons/actions/runs/37189092793
Артефакты на VPS: /home/suselman/projects/pencil-agents/494-wash-cache/temp/494-wash-cache/hairline-baseline.log, ci707-failed.log; Playwright trace/test-results сохранены в рабочей копии.

Релиз-трек #314. Найдено при #494 (разборка PencilEngine), PR #707/#708.
