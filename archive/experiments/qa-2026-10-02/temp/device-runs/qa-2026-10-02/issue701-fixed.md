Исправлено локально: sliced rebuild при4-slot overflow освобождает finished entries, которые не продолжаются в оставшемся журнале, черезexisting lost-wash path вместоsynch spill. Продолжающиеся entries сохраняют прежнийspill/continuation contract; slots/GPUbudget не подняты.

Valid engine baseline FAIL/after3PASS (finished, future continuation, journal grows mid-job); related117PASS, full268files/3417PASS. Typecheck/actualoxlintPASS (existingwarnings).

Browser:5independentSocket.IOauthors+2native browser renderers on the same AMD GPU, undo startsrebuild, syncGLreadsInJob0, latecontinuation, redo, fresh3rd browser context on the same AMD GPU. RawSHA256 identical. PASS22.4sec. Firstfailedbrowserrun wasQA count error afterundo; correctedrepeatpasses.

3physicalGPUlongroom2975ops afterreload healthy/journalequal/rawdiffmax2. Subsequent20-personsustained runcontinues; no claim allGPUlatencyfixed (iPadtail675–932ms stillobserved; perfmeasurementcontinues). No push/merge.
