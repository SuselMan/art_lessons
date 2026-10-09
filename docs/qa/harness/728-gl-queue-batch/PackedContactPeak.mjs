// Isolated packing prototype, no runtime import. Certificate remains private.
const certified=new WeakMap();
export const exposureFromByte=peak=>peak===0?0:-Math.log(Math.max(1-peak/255,1/255));
export function scanExposure(pixels){let peak=0;for(let i=2;i<pixels.length;i+=4)peak=Math.max(peak,pixels[i]);return exposureFromByte(peak)}
export function packContact(vx,vy,weight,{privateOwnedImmutable=false}={}){
 const pixels=new Uint8Array(weight.length*4);let peak=0;
 for(let i=0;i<weight.length;i++){
  pixels[i*4]=Math.round(127.5+127.5*(weight[i]>0?vx[i]/weight[i]:0));
  pixels[i*4+1]=Math.round(127.5+127.5*(weight[i]>0?vy[i]/weight[i]:0));
  pixels[i*4+2]=Math.round(255*weight[i]);pixels[i*4+3]=255;
  // Read the STORED byte: conversion wraps/NaN→0, unlike max rounded input.
  peak=Math.max(peak,pixels[i*4+2]);
 }
 if(privateOwnedImmutable)certified.set(pixels,{peak,length:pixels.length});
 return pixels;
}
export function contactExposure(pixels,{exclusiveUnexposedPayload=false}={}){
 const c=exclusiveUnexposedPayload?certified.get(pixels):null;
 return c&&c.length===pixels.length?exposureFromByte(c.peak):scanExposure(pixels);
}
export function exposeOrMutatePayload(pixels){certified.delete(pixels)}
