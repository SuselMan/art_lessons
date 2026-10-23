# Первый actual V spiral capture: неуспешно

Frozen5297, один own Chrome DISPLAY=:0, безundo. Первый запуск безDISPLAY завершился доGL; второй былединственнымactualGPUrun. Первомуcase не удалось закончитьidle в120сек, browser.close вfinallyисполнен. Rawfilesневыгружены. Source V policy нельзяоцениватьпофикстуре бездампов.

House ps ближе к timeout: node665981 RSS70596KiB, Chrome665992, renderer666104 RSS166492KiB, GPU666022 RSS71620KiB. Наэтомснимке memoryrunawayнедоказан; SSH отвечалсзадержкой. Никакойpkill/restart/devsourcechange.

ПередследующимGPUслотом harnessусилен: sourceDone maxодинpreparecapture, case/opprogress, pageerror+consoleerror, timeout включает seq/GL/lost/frontDone/storesbytes/settle/queue/rebuild/pending. Этообъяснитостановку безповторенияслепогоfullcapture. Поканеперезапускался.
