"""Geometry helpers for the Athena terminal-tractor visual concepts.
Not factory CAD. Python 3 + numpy + Pillow. Local metre coordinates, GLB Y-up.
Imported by build_tractors.py.
"""
import math,json,struct,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
OUT=Path(__file__).resolve().parent
MATS=[('Cab red enamel',(.55,.026,.025),.35,.31),('Dark chassis',(.12,.15,.17),.6,.4),('Graphite',(.075,.09,.10),.45,.45),('Galvanized steel',(.36,.42,.45),.8,.39),('Rubber',(.025,.029,.032),0,.86),('Wheel silver',(.61,.65,.67),.75,.29),('Glass',(.045,.16,.21),.45,.16),('Safety yellow',(.95,.65,.075),.3,.32),('Light lens',(.86,.93,.96),.1,.18),('Amber',(.99,.32,.025),.1,.23),('Red lens',(.65,.018,.025),.1,.2),('Dark grille',(.035,.043,.05),.35,.6)]
parts={};decals=[];cur='frame';MODEL=''
def add(v,f,mat):
 a,b=parts.setdefault((cur,mat),([],[]));off=len(a);a.extend(np.asarray(v).tolist());b.extend((np.asarray(f)+off).tolist())
def beam(a,b,w,d=None,mat=2):
 a=np.array(a,float);b=np.array(b,float);z=b-a;z/=np.linalg.norm(z);ref=np.array([0,0,1.]) if abs(z[2])<.95 else np.array([0,1.,0]);u=np.cross(z,ref);u/=np.linalg.norm(u);v=np.cross(z,u);d=w if d is None else d
 vs=[p+u*s*w/2+v*t*d/2 for p in [a,b] for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 fs=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];add(vs,fs,mat)
def box(c,s,mat=2):
 x,y,z=c;sx,sy,sz=s;beam((x,y,z-sz/2),(x,y,z+sz/2),sx,sy,mat)
def tube(a,b,r,mat=3,n=12):
 a=np.array(a,float);b=np.array(b,float);z=b-a;z/=np.linalg.norm(z);ref=np.array([0,0,1.]) if abs(z[2])<.95 else np.array([0,1.,0]);u=np.cross(z,ref);u/=np.linalg.norm(u);v=np.cross(z,u)
 vs=[p+r*(u*math.cos(i*2*math.pi/n)+v*math.sin(i*2*math.pi/n)) for p in [a,b] for i in range(n)];fs=[]
 for i in range(n):j=(i+1)%n;fs.extend([[i,j,n+j],[i,n+j,n+i]])
 for i in range(1,n-1):fs.extend([[0,i+1,i],[n,n+i,n+i+1]])
 add(vs,fs,mat)
def surface(v,mat):
 # Input convex polygon with outward winding.
 add(v,[[0,i,i+1] for i in range(1,len(v)-1)],mat)
def prism_x(x1,x2,profile,mat):
 # CCW yz profile, outward face winding.
 n=len(profile);vs=[(x,y,z) for x in [x1,x2] for y,z in profile];fs=[]
 for i in range(1,n-1):fs.extend([[0,i+1,i],[n,n+i,n+i+1]])
 for i in range(n):j=(i+1)%n;fs.extend([[i,j,n+j],[i,n+j,n+i]])
 add(vs,fs,mat)
def chamfer_box(c,s,cut,mat):
 x,y,z=c;sx,sy,sz=s;xy=[(-sx/2+cut,-sy/2),(sx/2-cut,-sy/2),(sx/2,-sy/2+cut),(sx/2,sy/2-cut),(sx/2-cut,sy/2),(-sx/2+cut,sy/2),(-sx/2,sy/2-cut),(-sx/2,-sy/2+cut)]
 vs=[(x+xx,y+yy,zz) for zz in [z-sz/2,z+sz/2] for xx,yy in xy];fs=[]
 for i in range(1,7):fs.extend([[0,i+1,i],[8,8+i,8+i+1]])
 for i in range(8):j=(i+1)%8;fs.extend([[i,j,8+j],[i,8+j,8+i]])
 add(vs,fs,mat)
def polyline(pts,r=.016,mat=2):
 for a,b in zip(pts,pts[1:]):tube(a,b,r,mat,8)
def ring_segment_x(x,y,z,r1,r2,width,start,end,mat,n=24):
 # Curved fender; construct closed arc shell around X axis.
 ang=np.linspace(start,end,n+1);vs=[]
 for xx,rr in [(x-width/2,r1),(x+width/2,r1),(x-width/2,r2),(x+width/2,r2)]:
  vs.extend([(xx,y+rr*math.cos(t),z+rr*math.sin(t)) for t in ang])
 q=n+1;fs=[]
 for i in range(n):
  for a,b in [(0,1),(1,3),(3,2),(2,0)]:
   aa=a*q+i;bb=b*q+i;fs.extend([[aa,aa+1,bb+1],[aa,bb+1,bb]])
 for i in [0,n]:
  v=[i,q+i,3*q+i,2*q+i];fs.extend([[v[0],v[2],v[1]],[v[0],v[3],v[2]]])
 add(vs,fs,mat)
def wheel(x,y,z,name):
 global cur
 cur=name
 # Rotationally symmetric tire with bevelled shoulders; local X is axle.
 prof=[(-.17,.36),(-.17,.47),(-.13,.53),(-.09,.55),(.09,.55),(.13,.53),(.17,.47),(.17,.36)]
 n=48;vs=[]
 for xx,r in prof:vs.extend([(x+xx,y+r*math.cos(t*2*math.pi/n),z+r*math.sin(t*2*math.pi/n)) for t in range(n)])
 fs=[]
 for j in range(len(prof)-1):
  for i in range(n):k=(i+1)%n;a=j*n+i;b=j*n+k;c=(j+1)*n+k;d=(j+1)*n+i;fs.extend([[a,b,c],[a,c,d]])
 add(vs,fs,4)
 # Hub, mounting bolts, rim dishes, concentric sidewall ribs.
 tube((x-.18,y,z),(x+.18,y,z),.345,5,32)
 for sign in [-1,1]:
  face=x+sign*.184
  tube((face,y,z),(face+sign*.018,y,z),.25,3,24)
  tube((face+sign*.018,y,z),(face+sign*.065,y,z),.145,5,20)
  for i in range(10):
   t=2*math.pi*i/10;tube((face,y+.202*math.cos(t),z+.202*math.sin(t)),(face+sign*.025,y+.202*math.cos(t),z+.202*math.sin(t)),.023,5,6)
  for rr in [.385,.442]:
   pts=[(face,y+rr*math.cos(t),z+rr*math.sin(t)) for t in np.linspace(0,2*math.pi,49)]
   polyline(pts,.005,4)
 # Repeated tread bars oriented around tyre, not flat cubes.
 for i in range(40):
  t=2*math.pi*i/40
  for xx in [-.065,.065]:
   a=(x+xx-.045,y+.554*math.cos(t-.025),z+.554*math.sin(t-.025));b=(x+xx+.045,y+.554*math.cos(t+.025),z+.554*math.sin(t+.025));beam(a,b,.027,.018,4)
def lamp(c,size,mat):
 box(c,size,2);x,y,z=c;box((x,y-.006-size[1]/2,z),(size[0]*.78,.018,size[2]*.72),mat)
def label(verts,brand):decals.append((cur,np.array(verts,float),brand))
# Version 2: real rounded geometry and crease-aware interpolated vertex normals.
def round_outline(points,r,segments=6):
    pts=np.asarray(points,float);out=[]
    for i,p in enumerate(pts):
        prev=pts[(i-1)%len(pts)]-p;nxt=pts[(i+1)%len(pts)]-p
        rr=min(r,np.linalg.norm(prev)*.24,np.linalg.norm(nxt)*.24)
        a=p+prev/np.linalg.norm(prev)*rr;b=p+nxt/np.linalg.norm(nxt)*rr
        for t in np.linspace(0,1,segments+1):out.append((1-t)**2*a+2*(1-t)*t*p+t*t*b)
    return np.array(out)

def inset_outline(points,d):
    pts=np.asarray(points,float);out=[]
    for i,p in enumerate(pts):
        a=p-pts[(i-1)%len(pts)];a/=np.linalg.norm(a);b=pts[(i+1)%len(pts)]-p;b/=np.linalg.norm(b)
        na=np.array([-a[1],a[0]]);nb=np.array([-b[1],b[0]])
        bis=na+nb;den=np.dot(bis,na)
        out.append(p+(bis*d/den if abs(den)>1e-8 else na*d))
    return np.array(out)

def prism_x(x1,x2,profile,mat):
    # Tangent-rounded outline plus quarter-circle edge fillets across thickness.
    r=.065 if cur=='cab_shell' else .045
    r=min(r,(x2-x1)*.15)
    outline=round_outline(profile,r*1.5,6);n=len(outline);vs=[]
    rings=[]
    for t in np.linspace(0,math.pi/2,7):rings.append((x1+r-r*math.cos(t),r-r*math.sin(t)))
    for t in np.linspace(math.pi/2,0,7):rings.append((x2-r+r*math.cos(t),r-r*math.sin(t)))
    for x,inset in rings:
        vs.extend([(x,y,z) for y,z in inset_outline(outline,inset)])
    fs=[]
    for j in range(len(rings)-1):
        for i in range(n):
            k=(i+1)%n;a=j*n+i;b=j*n+k;c=(j+1)*n+k;d=(j+1)*n+i
            fs.extend([[a,b,c],[a,c,d]])
    end=(len(rings)-1)*n
    for i in range(1,n-1):fs.extend([[0,i+1,i],[end,end+i,end+i+1]])
    add(vs,fs,mat)

_box_sharp=box
_surface_sharp=surface
_ring_sharp=ring_segment_x

def rounded_box(c,s,r,mat,segments=5):
    c=np.array(c,float);h=np.array(s,float)/2;r=min(r,min(h)*.80)
    coords=[]
    for v in h:
        coords.append(np.unique(np.r_[np.linspace(-v,-v+r,segments+1),np.linspace(v-r,v,segments+1)]))
    vs=[];fs=[]
    for axis in range(3):
        others=[a for a in range(3) if a!=axis]
        for sign in [-1,1]:
            start=len(vs);aa,bb=coords[others[0]],coords[others[1]]
            for x in aa:
                for y in bb:
                    q=np.zeros(3);q[axis]=sign*h[axis];q[others[0]]=x;q[others[1]]=y
                    inner=np.clip(q,-h+r,h-r);delta=q-inner
                    pos=inner+r*delta/np.linalg.norm(delta);vs.append(c+pos)
            for i in range(len(aa)-1):
                for j in range(len(bb)-1):
                    a=start+i*len(bb)+j;b=a+len(bb);cc=b+1;d=a+1
                    test=np.cross(np.array(vs[b])-vs[a],np.array(vs[cc])-vs[a])
                    face=[a,b,cc] if test[axis]*sign>0 else [a,cc,b]
                    face2=[a,cc,d] if test[axis]*sign>0 else [a,d,cc]
                    fs.extend([face,face2])
    add(vs,fs,mat)

def chamfer_box(c,s,cut,mat):rounded_box(c,s,max(cut,.025),mat)

def box(c,s,mat=2):
    # Rounded major sheet metal and lamp housings; structural bars stay crisp.
    if (cur in ['cab_shell','engine_cover','utilities','bumpers','mirrors','lights'] and min(s)>.045):
        rounded_box(c,s,min(.045,min(s)*.28),mat,4)
    else:_box_sharp(c,s,mat)

def surface(v,mat):
    a=np.array(v,float)
    if cur=='cab_glazing' and len(a)>=4:
        a=round_outline(a,.035,6)
    _surface_sharp(a,mat)

def ring_segment_x(x,y,z,r1,r2,width,start,end,mat,n=24):
    _ring_sharp(x,y,z,r1,r2,width,start,end,mat,max(64,n))

def smooth_normals(v,f):
    v=np.asarray(v,float);f=np.asarray(f,int);p=v[f]
    face=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);lens=np.linalg.norm(face,axis=1);unit=face/lens[:,None]
    points=p.reshape(-1,3);n=np.repeat(unit,3,axis=0)
    # Geometric duplicates, even across separate primitive faces, share lighting.
    _,inv=np.unique(np.round(points,7),axis=0,return_inverse=True)
    order=np.argsort(inv);breaks=np.r_[0,np.flatnonzero(np.diff(inv[order]))+1,len(order)]
    area_weights=np.repeat(lens,3);result=n.copy();threshold=math.cos(math.radians(42))
    for lo,hi in zip(breaks[:-1],breaks[1:]):
        ids=order[lo:hi];nn=n[ids]
        weights=(nn@nn.T)>threshold
        sums=weights.astype(float)@(nn*area_weights[ids,None])
        result[ids]=sums/np.linalg.norm(sums,axis=1)[:,None]
    return result

