Исправлено локально в c2526b8d (не push): когда целевой слой исчезает или редактирование становится недоступным, `filterLayerId` сбрасывается. Возвращение слоя через чужой undo больше не открывает FilterPanel само.

Browser regression до правки FAIL, после PASS. Все5 типов фильтра + peer drawing / Cancel / Apply / undo / redo / late join PASS. Один Cancel прогон попал на source HMR во время проверки; чистый повтор PASS. Typecheck и lint PASS (существующие warnings). Сценарий QA-015 сохранён в docs/qa/scenarios/collaboration.md, детали в docs/qa/runs/2026-10-02.md.
