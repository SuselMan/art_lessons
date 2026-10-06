# Ночная проверка акварели, 6 октября 2026

Принятая модель и технические исправления в production f5397918f7165b16614c01822184d4b7f2c76d7d. PR723/724/725/726 объединены; последний required CI37422861823 прошёлtest2m21s/single-browser19m8s, deploy37425190925SUCCESS, фактический version.json подтверждён. Two-browser advisory первогоPR отменён после45минут: не PASS.

Галерея принятых результатов обновлена:11листов,10досок,76слотов/68нарисованных/8историческипустых; лист12 толькофото.217комментариев сохраненыSHA413d0283b170c62edddb7a9dc7d18b8f6af2de1153a1d11efc7f0bf8dab6f0dc. Публичный тег изображений1e49aa99-clip, а не technicalproductionSHA: packed replay ужеF32, исправление liveprecision не меняет формат истории.

Исправлены захват старой плёнки при первом шаге, жизнь S2временных текстур при отмене/потереcontext, восстановлениеcarriedGPUcheckpoint и сохранениеисторическихpaper_dry. Отдельный причинный pairedexperiment показал173различныхпикселя native64vsownpacked; только ранняяcodecF32точность→0. Финальнаяреализация сохраняет исходные записанныеDab/seed/wet/standingkey identities.

Проверки:
-3511unitPASS/16skip,types/lint/mapcheck/maprulesPASS.
-5клиентов в одномChrome наactual640×480:25функциональныхбарьеровPaint/Dry/Undo/Redo/rejoin,20peerPNGcomparisonexact,GL0. Это5independentcontexts, не5отдельныхустройств. A3вариантыупёрлисьвRAMguard, неPASS.
-40.061мин/165мазков2авторовмалогообщегохолста,20раундов/5actualcontextloss+peerACK,rawjournals включая7Dryexact. Из40PNGcomparison37exact,3по1пикселю. Этоsourceдоprecisionfix, неallpixelPASS.
-Finalprecision33native/4раунда6.12мин наactual640×480, carriedCPprefix24/1wash/1tile→0приloss,peerACKwhilelost,8peer/freshPNGcomparisonexact/GL0.
-Cold ownQAbackend4537 restart:165stroke/7Dry/186ops сохранилисьexact, обаactualclose/newopen/XHRroom_state;before/afterPNGexact.2новыхstrokeACK→188ops,peerPNGexact/GL0. Ранниеfixturetimeouts отдельноinconclusive. Productionserverдляэтоготеста не перезапускался.
-2автораfinalsource1754×2480/fine:водаA→пигментB→цветA→общийDry→UndoRedoцветногомазка. Rawauthoritativejournals/wholepeerPNGexact,positivewetprofile/standingremapretainedkeys,GL0.640×480 тамviewport.
-SamsungAdreno650:unwrappedfinalnative+actualACK/UndoRedo PNGexact; ещё3перекрывающихсямазка80/160/240иexactUndoRedoallPNG,GL0. ПрограммныйPointerInput/CDPввод, неphysicalstylus.

Плавностьнеобъявленаисправленной. НаVegaactive22.2ms≈45Hz; Sdirtyscissor/alpha:false/preserve:false и1pixeldefaultFBdraw не далиустойчивогоgain. Noopfinaldraw→60Hz являетсяstalescreendiagnostic, неfix. AsyncGPUqueries измерилилишьвыбранныеpaper/finaldraw, неwholepipeline. Полная4strace содержитnestedGPUserviceflush122.68ms/RealSwapBuffers110.595ms иbrowserpresentationlatency; driver/presentationcause остаётсягипотезой. Noneexperimentalpresentationflags включены вproduction.

Полныйreplay59–60мазковбольшогоA3занимал≈42с; исходный60stimeoutнеповторён, неdeadlockproof. Surface/iPad текущейфинальнойсборкой не проверены. Основныедоказательства в соседних680-*.md иignoredtemp наVPS/home; sourcepassports иограничениясохранены.
