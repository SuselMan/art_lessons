import {describe,it,expect} from 'vitest'
import {SOURCE_FMA_F32_GLSL} from './sourceFmaF32Shader'

// Execute ONLY the literal GLSL scan bodies after declaration syntax conversion.
// This checks the emitted code, not a separately maintained implementation.
function scan(name:string,inputs:string[],output:string){
 const body=SOURCE_FMA_F32_GLSL.split(`// scan:${name}:begin`)[1]?.split(`// scan:${name}:end`)[0]
 if(!body)throw Error(`Missing byte scan ${name}`)
 expect(body).not.toContain('sfmaBit(')
 expect(body).not.toContain('sfmaGet(')
 return new Function(...inputs,'floor','mod','sfmaPow','max',`${body.replace(/\b(?:int|float)\s+/g,'let ')};return ${output}`)
}
const floor=Math.floor,mod=(a:number,b:number)=>a%b,pow=(n:number)=>2**n
const bit=(a:number[],n:number)=>n<0||n>=88?0:Math.floor((a[Math.floor(n/8)]??0)/2**(n%8))%2

describe('literal FMA sequential byte scans',()=>{
 it('preserves every byte bit and leading-bit position at each limb',()=>{
  const tops=scan('input-top',['p','z'],'[pt,ct]'),top=scan('result-top',['r'],'top')
  for(let limb=0;limb<11;limb++)for(let value=0;value<256;value++){
   const a=Array<number>(11).fill(0);a[limb]=value
   let expected=-1;for(let i=0;i<88;i++)if(bit(a,i))expected=i
   expect(top(a,floor,mod,pow)).toBe(expected)
   if(limb<6)expect(tops(a,a,floor,mod,pow)).toEqual([expected,expected])
  }
 })
 it('preserves input-top scans for full mantissas and exact 48-bit significand products',()=>{
  const tops=scan('input-top',['p','z'],'[pt,ct]')
  const significands=[0,1,0x7fffff,0x800000,0x800001,0xfffffe,0xffffff]
  for(let bit=0;bit<24;bit++)significands.push(2**bit,2**bit-1)
  const limbs=(n:number)=>Array.from({length:11},()=>{const byte=n%256;n=Math.floor(n/256);return byte})
  const reference=(a:number[])=>{let top=-1;for(let i=0;i<48;i++)if(bit(a,i))top=i;return top}
  for(const a of significands)for(const b of significands){const p=limbs(a*b),z=limbs(b);expect(tops(p,z,floor,mod,pow)).toEqual([reference(p),reference(z)])}
 })
 it('preserves descending quotient accumulation and ascending sticky scans across rounding boundaries',()=>{
  const quotient=scan('quotient',['r','top','shift'],'q'),sticky=scan('sticky',['r','shift','discarded'],'sticky')
  let seed=0x12345678
  for(let sample=0;sample<256;sample++){
   const r=Array.from({length:11},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24})
   for(let shift=-2;shift<=90;shift++){
    const top=sample%89-1,discarded=sample%2;let q=0,s=discarded
    for(let j=0;j<88;j++){const i=87-j;if(i<=top&&i>=Math.max(shift,0))q=q*2+bit(r,i)}
    for(let i=0;i<88;i++)if(i<shift-1)s=Math.max(s,bit(r,i))
    expect(quotient(r,top,shift,floor,mod,pow)).toBe(q)
    expect(sticky(r,shift,discarded,floor,mod,pow,Math.max)).toBe(s)
   }
  }
 })
})
