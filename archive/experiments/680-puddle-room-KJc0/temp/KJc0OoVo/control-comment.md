Кандидат a431c57e прошёл дополнительные Vega controls (QA3330c2ea):

- чистая вода seq19: P=0, V иwholePNG baseline/candidate byte-exact;
- сухая кисть на сухой бумаге: V=0, P иwholePNG byte-exact;
- actual carry32×8, stride8: сухой4texels-gap не пропускает P; output exact иmass5120;
- connected plateau действительно переносит1280P к правому острову сmass5120;
- wetgate0 сохраняет exact no-op.

Все6replay GL0, contextLostfalse, Chrome finally закрыт. GPU теперь у профилировщика.
СледующийCPU-readyконтроль — настоящий Undo/Redo исходного seq27 иwholePNGbefore/redo; ещё не запускал.
Публикацийsource/deployне было. Это всё ещё кандидат, а не закрытаяreleaseзадача.
