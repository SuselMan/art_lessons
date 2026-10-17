#745: новые онлайн-операции при настоящем WebGL context loss на Samsung

Runtime e5d08c61. НастоящийAdreno650/DPR2.125/touch5/300MiB, flagscache/hiddenOFF. Собственная512²комната; SocketA посеял3мокрыхM70слоя. Доloss все3actualcanonical совпали с independent full accepted API replay.

В единственномownedisolatedpage вызван WEBGL_lose_context. НативныйisContextLost иengine._contextLost былиtrue какдо, такипосле5последовательноACK-acceptedSocketBопераций: waterL1(seq7), layerDryL2(8), pigmentL3(9), UndoBdry(10), UndoBwater(11). Все5ID/seq проверенывAPI; ониужебыливлокальномlogприlost. Нашprobeвэтотпромежутокнечиталпиксели/goal/solver: толькоnativeLost/engineLost/log/queue.

restoreContext→естественнаяготовность→physicalвсех3слоёв→canonicalвсех3слоёв→толькопослеэтогоfullAPIlogoracleсUndo/Redofold:0diff/GL0. Бюджет не увеличивался. Затем trustednativeWCнаL1 принят, ownUndo действительноtargetегооперациюи меняетhash, Redo возвращаетhash, freshisolatedcoldrejoin сохраняетего. Всего6стадий×3слоя=18exactпроверок; ошибкиruntime[]; actualbeforeoracle/in-orderAPI IDs доказанывкаждойстадии.

Граница времени: waitsконтекстаиidleимеютотдельные30сdeadline; общийrestoreelapsedотдельнымтаймеромнеизмерялся. Однако same-VPSmtime файловbefore-loss-input иaccepted-during-loss-input консервативноохватываютВСЁloss+5ops+restore+ready+3oracles:5020.065мс. Следовательноготовностьпослеrestoreточноуложиласьв30с вэтомслучае. Это неisolatedlatencybenchmark (sharedQA/rootCPUпараллельно).

Во времяcanonicalcapture парковка3источниковможетвызватьrehydration/обычныйsolver; addedcomputationsсохранены, неутверждается«readбезработы». Ниодинматериальныйdeposition/physicsшагнепропускался. HardwareпроверканеозначаетAMD/Adrenoдетерминизм — #748 по-прежнемуOPEN.

Cleanup: ownroomDELETE200, authfilesудалены, обаownedcontexts/NodeSocketsзакрытыfinally, исходнаявкладкавосстановлена, ownSSH4086238/session70733остановлен. Remote9235/пользовательскийChromeнетронуты. Battery100%AC37.5→37.6°C. RawdisposableID774-samsung-contextlost-ops-20261017подлежитguardedfinishпослеcompactproof; rootзапрошенприunprivilegedprotection.
