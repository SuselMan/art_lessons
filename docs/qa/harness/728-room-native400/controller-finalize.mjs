// The real controller and offline subprocess share this finally ordering.
// Owned descriptor restoration is part of closeOwn and must precede WS close.
export async function finalizeController({monitor,hardTimer,closeOwn,ws,pending}){
 clearInterval(monitor);clearTimeout(hardTimer)
 await closeOwn();ws?.close()
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Own tab closed'))}
 pending.clear()
}
