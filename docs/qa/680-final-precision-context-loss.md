# Финальная precision версия: два автора и настоящий carried checkpoint

Frozen источник frontend5314/backend4537: indexSHA `c0fd96c0492b05408550ef8baf91a1b3e8389688a1b5375c38af763b16373408`, codecDabSHA `23900d55731a8f4fbd830b4259f724fd5e333bd83af7b5709ddeab0c43e6c726`, shaderSHA `d6928e5c49342a1ec16f47f4ee7fa9c4cbb9befd010e29fd7f833d975148bdd8`. ВсеSHA проверены доChrome. Source/физика/backend не менялись в прогоне.

Обычный UI создал собственную комнату TkvT_hmG, Custom640×480, brush32, fine paper. Physical размер подтверждён read-only Prisma Room: infinitefalse/canvasWidth640/canvasHeight480, actualroomStore и экспортированныеPNG640×480. Это не толькоviewport. Actual renderer ANGLE/AMD Radeon Graphics, radeonsi renoir ACO/OpenGL4.6. Два разных автора рисуют в общийlayer-1; третийfresh witness используется последовательно вместо закрытогоB-page, максимумдваengine одновременно. IdentityB сохраняется.

Explicit4раунда,32настоящих native жеста плюс1дополнительный peerACK во время actualWebGLloss.367187мс≈6,12минуты настоящегоinput/settle/reveal/history/rejoin. Ни filler sleep, ни уменьшенияфизики. Каждыйконтрольныйnativegesture encoded≤36dabs/однаchunk. Dryround0, UndoRedoround1, rejoinпослекаждогораунда. Sourceprecision, а не старыйb863long.

Все4 проверки authoritativeA/B/fresh журналов прошли EXACT, включаяDry. Все8A/B versus fresh PNG сравнений:0pixels/max0/alpha0/premult0. PNG снимаются доB-rejoin. Повторный B-rejoin тожеexact; nonemptyA3581/3583/3679/4463пикселяпо4раундам. GL0/lostfalse наidle, restorefaults[].

Перед loss наround3 был настоящий carried checkpoint: count1, prefix24операции, washIds1, carriedtrue, tile1. Послеactual loss checkpointsпусты. Это подтверждение обработки dead-carriedGLcheckpoint в комбинации с новойnativecodecprecision, а не тест пустогоcheckpoint. Дополнительнаяоперация `7iXQuFrLbl`, authoritative seq36/state done/pendingfalse, получена автором иrecipient пока recipientactualContextLosttrue. Послеrestore полныйжурнал36операций иPNG совпалточно сfresh. Подробныеpayload/ID/timestamps сохранены.

RAMguard500MiB сохранён; минимумсвободнойRAM завершённыхфаз2817253376байт≈2,62GiB. Idle bound240с сprogress5с; roundbound300с, wall30мин явные. Chrome закрытfinally, exit0, GPU освобождён.

ScopePASS: финальнаяprecision версия, дваавтора, общийслой,32короткихжеста+ACKduringloss, actualcarriedprefix24, Dry/UndoRedo/rejoin, physical640×480/brush32. Это не сорокаминутныйsoak новойprecision версии, не fullA3performance и не leakproof; старый40минутныйsoak b863 задокументирован отдельно.

Артефакты: `680-combined-stability/temp/context-loss/final-precision-four-rounds/` report.json и16PNG. ПолнаякопияVPS `680-context-restore/temp/context-loss/final-precision-four-rounds/`; контроллер `temp/context-loss/final-precision-four-rounds.mjs`. Sourcepassport6файлов вreport, DBqueryread-only, credentialsнепечатались.
