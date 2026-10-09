/** Vite dev HTTP adds only the exact emitted external map as inline footer. */
export function optimizedServedBytesExact(disk,map,served){
 if(served.equals(disk))return true;
 const expected=Buffer.concat([disk,Buffer.from('\n//# sourceMappingURL=data:application/json;base64,'+map.toString('base64'))]);
 return served.equals(expected);
}
