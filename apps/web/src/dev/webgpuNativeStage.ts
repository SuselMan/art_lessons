import { runCanonicalStageDiagnostic } from '../engine'
void runCanonicalStageDiagnostic().catch(error => {
 document.querySelector('#status')!.textContent = String(error)
 console.error(error)
})
