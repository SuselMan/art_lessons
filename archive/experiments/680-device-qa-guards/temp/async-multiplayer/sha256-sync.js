// Streaming diagnostic SHA-256; retains one 64-byte schedule, no full copy.
function sha256Bytes(raw) {
 const primes=[];for(let n=2;primes.length<64;n++){let yes=true;for(let d=2;d*d<=n;d++)if(n%d===0){yes=false;break}if(yes)primes.push(n)}
 const K=primes.map(p=>((Math.cbrt(p)%1)*4294967296)>>>0),H=primes.slice(0,8).map(p=>((Math.sqrt(p)%1)*4294967296)>>>0),W=new Uint32Array(64),rr=(x,n)=>(x>>>n)|(x<<(32-n));
 const blocks=Math.ceil((raw.length+9)/64),bits=raw.length*8;
 const byte=i=>i<raw.length?raw[i]:i===raw.length?128:i>=blocks*64-8?(i<blocks*64-4?Math.floor(bits/4294967296)>>>((blocks*64-5-i)*8):bits>>>((blocks*64-1-i)*8))&255:0;
 for(let b=0;b<blocks;b++){
  for(let t=0;t<16;t++){const i=b*64+t*4;W[t]=((byte(i)<<24)|(byte(i+1)<<16)|(byte(i+2)<<8)|byte(i+3))>>>0}
  for(let t=16;t<64;t++){const x=W[t-15],y=W[t-2];W[t]=(W[t-16]+(rr(x,7)^rr(x,18)^(x>>>3))+W[t-7]+(rr(y,17)^rr(y,19)^(y>>>10)))>>>0}
  let[a,c,d,e,f,g,h,j]=H;
  for(let t=0;t<64;t++){const u=(j+(rr(f,6)^rr(f,11)^rr(f,25))+((f&g)^(~f&h))+K[t]+W[t])>>>0,v=((rr(a,2)^rr(a,13)^rr(a,22))+((a&c)^(a&d)^(c&d)))>>>0;j=h;h=g;g=f;f=(e+u)>>>0;e=d;d=c;c=a;a=(u+v)>>>0}
  const vals=[a,c,d,e,f,g,h,j];for(let i=0;i<8;i++)H[i]=(H[i]+vals[i])>>>0;
 }
 return H.map(x=>x.toString(16).padStart(8,'0')).join('');
}
