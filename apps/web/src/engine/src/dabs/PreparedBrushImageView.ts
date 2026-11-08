/** Borrowed, already admitted canonical RGBA plane. No URL, upload, decoding or
 * ownership transfer happens here. Crop coordinates are top-down texel edges in a raw CAS upload (row0 -> v=0). */
export interface PreparedBrushImageView{
 readonly texture:WebGLTexture
 readonly width:number;readonly height:number
 readonly palette?:Readonly<{texture:WebGLTexture;assertCurrent():void}>
 readonly crop:Readonly<{x:number;y:number;width:number;height:number}>
 /** Owner must assert its real asset/context generation. Called before GL work. */
 readonly assertCurrent:()=>void
}
