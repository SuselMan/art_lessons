import{it,expect}from'vitest'
/** CPU ideal-Q8 example of mode1 with k=f=1; not a GPU rounding oracle. */
const fit=(v:number[])=>{const divisor=Math.max(255,...v);return v.map(x=>Math.round(x*255/divisor))}
const land=(base:number[],film:number[])=>fit(base.map((x,i)=>x+film[i]))
const maxFilm=(a:number[],b:number[])=>a.map((x,i)=>Math.max(x,b[i]))
it('immutable base plus cumulative MAX film is partition independent; continuation rebase is a different source equation',()=>{
 const base=[200,0,0,200],f1=[100,0,0,100],f2=[0,200,0,200]
 const accumulated=maxFilm(f1,f2),reference=land(base,accumulated)
 const segmented=land(base,maxFilm(maxFilm([0,0,0,0],f1),f2))
 expect(reference).toEqual([191,128,0,255]);expect(segmented).toEqual(reference)
 const rebased=land(land(base,f1),f2)
 expect(rebased).toEqual([143,112,0,255]);expect(rebased).not.toEqual(reference)
 // Same source contacts, but rebase changes normalization and film history.
 expect(base).toEqual([200,0,0,200]);expect(base[0]).toBeGreaterThan(reference[0])
})
it('source MAX film and normalized load are not additive material totals',()=>{
 const source=[100,50,20,100],film=maxFilm(source,source)
 expect(film).toEqual(source);expect(film.reduce((a,b)=>a+b,0)).toBeLessThan(2*source.reduce((a,b)=>a+b,0))
 expect(land([255,0,0,255],[0,0,0,0])).toEqual(land([255,0,0,255],[255,0,0,255]))
})
it('conditional RGB<=A is preserved by MAX/add/fit but is not inferred from independent P.B',()=>{
 let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%256}
 for(let n=0;n<500;n++){const a=random(),b=random(),base=[random()% (a+1),random()%(a+1),random()%(a+1),a],source=[random()%(b+1),random()%(b+1),random()%(b+1),b];const color=land(base,maxFilm(source,source));expect(color.slice(0,3).every(x=>x<=color[3])).toBe(true);expect(color.every(x=>Number.isInteger(x)&&x>=0&&x<=255)).toBe(true)}
 // All-u8 bounded source records do not universally require RGB<=A either.
 expect(land([255,0,0,1],[0,0,0,0])).toEqual([255,0,0,1])
})
