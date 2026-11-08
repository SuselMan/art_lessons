/** Branch before division preserves exact zero/unit endpoints without legacy epsilon. */
export const KRITA_HARD_MIX_GLSL=`
float brushKritaHardMix(float b,float s){
 if(b>0.5){if(s==1.0)return 1.0;return min(1.0,b/(1.0-s));}
 if(s==0.0)return 0.0;
 return max(0.0,1.0-(1.0-b)/s);
}
`
