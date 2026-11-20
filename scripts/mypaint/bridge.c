#include <stdlib.h>
#include "mypaint-brush.h"
#include "mypaint-tiled-surface.h"
extern void grafetto_seed(MyPaintBrush *,unsigned);
extern unsigned grafetto_tile(int,int,int);
typedef struct {MyPaintBrush *brush;MyPaintTiledSurface surface;} Kernel;
static void request_start(MyPaintTiledSurface*s,MyPaintTileRequest*r){r->buffer=(guint16*)grafetto_tile(r->tx,r->ty,r->readonly);}
static void request_end(MyPaintTiledSurface*s,MyPaintTileRequest*r){}
Kernel *grafetto_create(unsigned seed){Kernel*k=calloc(1,sizeof(Kernel));if(!k)return 0;mypaint_tiled_surface_init(&k->surface,request_start,request_end);k->brush=mypaint_brush_new();mypaint_brush_from_defaults(k->brush);grafetto_seed(k->brush,seed);return k;}
void grafetto_destroy(Kernel*k){if(k){mypaint_brush_unref(k->brush);mypaint_tiled_surface_destroy(&k->surface);free(k);}}
unsigned grafetto_alloc(unsigned n){return (unsigned)calloc(1,n);}
void grafetto_free(unsigned p){free((void*)p);}
void grafetto_base(Kernel*k,int setting,float value){mypaint_brush_set_base_value(k->brush,setting,value);}
void grafetto_mapping(Kernel*k,int setting,int input,int n){mypaint_brush_set_mapping_n(k->brush,setting,input,n);}
void grafetto_point(Kernel*k,int setting,int input,int index,float x,float y){mypaint_brush_set_mapping_point(k->brush,setting,input,index,x,y);}
void grafetto_begin(Kernel*k){mypaint_surface_begin_atomic(&k->surface.parent);}
void grafetto_end(Kernel*k){MyPaintRectangle roi;mypaint_surface_end_atomic(&k->surface.parent,&roi);}
int grafetto_stroke(Kernel*k,float x,float y,float p,float tx,float ty,double dt){return mypaint_brush_stroke_to(k->brush,&k->surface.parent,x,y,p,tx,ty,dt);}
/* Preserve Grafetto's exact per-input RGBA8 boundary using integer math.
 * One page contains Q15RGBA followed by its canonical RGBA8 mirror. */
void grafetto_quantize(unsigned address){
    guint16 *pixels=(guint16*)address;unsigned char *bytes=(unsigned char*)(address+64*64*8);
    for(unsigned i=0;i<64*64*4;i++){unsigned value=pixels[i]>32768?32768:pixels[i];unsigned byte=(value*255+16384)>>15;bytes[i]=byte;pixels[i]=(byte*32768+127)/255;}
}
void grafetto_unpack(unsigned address){
    guint16 *pixels=(guint16*)address;unsigned char *bytes=(unsigned char*)(address+64*64*8);
    for(unsigned i=0;i<64*64*4;i++)pixels[i]=(bytes[i]*32768+127)/255;
}
