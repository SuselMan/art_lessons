/** Integer CPU-generated vertex streamfunction. No GPU hash/modulo/float noise. */
function hash(x:number,y:number,seed:number){let h=(seed^Math.imul(x,0x9e3779b1)^Math.imul(y,0x85ebca6b))>>>0;h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return(h&4095)-2048}
function smooth(t:number){return Math.floor((t*t*(768-2*t)+32768)/65536)}
function noise(x:number,y:number,period:number,seed:number){const X=Math.floor(x/period),Y=Math.floor(y/period),a=smooth(Math.floor((x-X*period)*256/period)),b=smooth(Math.floor((y-Y*period)*256/period));return Math.floor((hash(X,Y,seed)*(256-a)*(256-b)+hash(X+1,Y,seed)*a*(256-b)+hash(X,Y+1,seed)*(256-a)*b+hash(X+1,Y+1,seed)*a*b+32768)/65536)}
export function buildStream(aux:Uint32Array,n:number,seed:number,eddyCells=16,strength=128){
 if(!Number.isInteger(n)||n<8||aux.length!==n*n*4||!Number.isInteger(eddyCells)||eddyCells<4||eddyCells>64||!Number.isInteger(strength)||strength<0||strength>128)throw Error('Invalid streamfield')
 const paper=new Int32Array(n*n),temp=new Int32Array(n*n),blur=new Int32Array(n*n)
 for(let i=0;i<n*n;i++)paper[i]=aux[i*4+2]
 // Coherent paper component: integer separable box, not per-pixel white grain.
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let sum=0;for(let d=-4;d<=4;d++)sum+=paper[y*n+Math.max(0,Math.min(n-1,x+d))];temp[y*n+x]=Math.floor((sum+4)/9)}
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let sum=0;for(let d=-4;d<=4;d++)sum+=temp[Math.max(0,Math.min(n-1,y+d))*n+x];blur[y*n+x]=Math.floor((sum+4)/9)}
 const psi=new Int32Array((n+1)**2);let meanPotential=0
 for(let y=1;y<n;y++)for(let x=1;x<n;x++){
 const p=blur[Math.min(n-1,y)*n+Math.min(n-1,x)]
 const value=noise(x,y,eddyCells,seed)+Math.floor(noise(x,y,Math.min(64,eddyCells*2),seed^0x51ed270b)/2)+(p-128)*4
 psi[y*(n+1)+x]=value;meanPotential+=value
 }
 meanPotential=Math.floor(meanPotential/((n-1)**2));for(let y=1;y<n;y++)for(let x=1;x<n;x++){const i=y*(n+1)+x;psi[i]=Math.floor((psi[i]-meanPotential)*Math.min(x,y,n-x,n-y,8)/8)}
 let maxDelta=0;for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){const i=y*(n+1)+x;if(x<n)maxDelta=Math.max(maxDelta,Math.abs(psi[i+1]-psi[i]));if(y<n)maxDelta=Math.max(maxDelta,Math.abs(psi[i+n+1]-psi[i]))}
 let divisor=1;while(maxDelta>divisor*256)divisor*=2
 // Quantize VERTICES then difference: discrete divergence remains EXACT zero.
 for(let i=0;i<psi.length;i++)psi[i]=Math.floor(Math.floor(psi[i]/divisor)*strength/128)
 let actualMax=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*(n+1)+x;actualMax=Math.max(actualMax,Math.abs(psi[i+1]-psi[i]),Math.abs(psi[i+n+1]-psi[i]));aux[(y*n+x)*4+3]=psi[i]+32768}
 return{psi,metadata:{seed:seed>>>0,eddyCells,strength,normalizationPowerOfTwo:divisor,maxFaceRate:actualMax,rateDenominator:512,paperComponent:'integer9tap separable lowpass, terrain4codes',field:'artistic streamfunction, not Navier-Stokes; actual gated donor flux need not remain divergence-free'}}
}
export function faceRate(psi:Int32Array,n:number,a:number,b:number){const x=a%n,y=Math.floor(a/n),row=n+1;if(b-a===1)return psi[(y+1)*row+x+1]-psi[y*row+x+1];if(b-a===n)return psi[(y+1)*row+x]-psi[(y+1)*row+x+1];throw Error('Pair must be adjacent/canonical')}
