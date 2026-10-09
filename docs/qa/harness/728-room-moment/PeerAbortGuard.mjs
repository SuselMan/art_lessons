export function createPeerAbortGuard(){let reason=null;return{abort(value){reason??=String(value)},check(){if(reason!==null)throw Error('Peer cohort aborted: '+reason)},get reason(){return reason}}}
