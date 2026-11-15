# Dark-pixel (water) share in a GIBS NISAR GCOV false-colour PNG.
# Usage: python3 gibs_water_fraction.py <png>...  (numpy only; threshold max(R,G,B) < 70 on valid pixels)
# Crude proxy for open water (low backscatter), not a calibrated flood map.
import zlib,struct,sys,numpy as np
def readpng(p):
    b=open(p,'rb').read(); i=8; idat=b''; 
    while i<len(b):
        n,=struct.unpack('>I',b[i:i+4]); t=b[i+4:i+8]; d=b[i+8:i+8+n]
        if t==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',d[:10])
        if t==b'IDAT': idat+=d
        i+=12+n
    ch={2:3,6:4,0:1,4:2}.get(ct); assert bd==8 and ch,(bd,ct)
    raw=zlib.decompress(idat); stride=w*ch; out=np.zeros((h,stride),np.uint8); prev=np.zeros(stride,np.int32)
    for y in range(h):
        f=raw[y*(stride+1)]; line=np.frombuffer(raw[y*(stride+1)+1:(y+1)*(stride+1)],np.uint8).astype(np.int32)
        if f==0: cur=line
        elif f==2: cur=(line+prev)&255
        else:
            cur=np.zeros(stride,np.int32)
            for x in range(stride):
                a=cur[x-ch] if x>=ch else 0; c=prev[x-ch] if x>=ch else 0; up=prev[x]
                if f==1: pr=a
                elif f==3: pr=(a+up)//2
                else:
                    p=a+up-c; pa,pb,pc=abs(p-a),abs(p-up),abs(p-c); pr=a if pa<=pb and pa<=pc else (up if pb<=pc else c)
                cur[x]=(line[x]+pr)&255
        out[y]=cur; prev=cur
    return out.reshape(h,w,ch)
for p in sys.argv[1:]:
    a=readpng(p); rgb=a[...,:3].astype(int)
    valid=(a[...,3]>0) if a.shape[2]==4 else np.ones(a.shape[:2],bool)
    valid&=~((rgb==255).all(-1))&~((rgb==0).all(-1))
    water=valid&(rgb.max(-1)<70)
    print(p,'shape',a.shape,'valid %.0f%%'%(100*valid.mean()),'dark/water of valid %.1f%%'%(100*water.sum()/max(valid.sum(),1)))
