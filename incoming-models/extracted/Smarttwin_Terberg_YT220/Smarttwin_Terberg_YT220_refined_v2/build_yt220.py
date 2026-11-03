"""Original visual approximation inspired by the high-rise Terberg YT220.
Not factory CAD. Python 3 + numpy + Pillow. Local metre coordinates, GLB Y-up.
Run python build_yt220.py to regenerate the model and their actual-geometry previews.
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

def make():
 global parts,decals,cur
 parts={};decals=[]
 front=-1.7;rear=1.65;back=2.72
 cur='chassis'
 for x in [-.57,.57]:box((x,.15,.89),(.19,4.85,.31),3)
 for yy in [-1.9,-.9,.2,1.25,2.48]:box((0,yy,.86),(1.3,.14,.24),3)
 for yy in [front,rear]:
  tube((-1.1,yy,.56),(1.1,yy,.56),.09,3)
  tube((0,yy-.15,.56),(0,yy+.15,.56),.22,2)
  for x in [-.52,.52]:
   for z in [.64,.69,.74]:box((x,yy,z),(.13,.85,.035),2)
 for yy,ax in [(front,'front'),(rear,'rear')]:
  for sign,side in [(-1,'left'),(1,'right')]:
   for j,x in enumerate([sign*1.04] if ax=='front' else [sign*.85,sign*1.20]):wheel(x,yy,.56,f'wheel_{ax}_{side}_{j}')
 cur='decks_and_mudguards'
 for xx in [-1.12,1.12]:
  ring_segment_x(xx,rear,.56,.61,.65,.72,0,math.pi,3)
  box((xx,rear+.64,.45),(.68,.055,.66),4)
  ring_segment_x(xx,front,.56,.61,.65,.38,0,math.pi,0)
 box((-.41,-.12,1.2),(1.66,1.12,.10),3)
 box((.68,-1.26,1.22),(1.16,2.15,.12),3)
 # Diamond deck represented by repeated small ribs visible from medium view.
 for xx in np.arange(-1.14,.29,.13):
  for yy in np.arange(-.5,.37,.15):beam((xx,yy,1.26),(xx+.045,yy+.04,1.26),.012,.012,5)
 cur='cab_shell'
 x1,x2=-1.18,.34
 # High-rise older cab: vertical main windscreen and sloping raised front roof.
 profile=[(-2.31,1.35),(-.30,1.35),(-.30,3.62),(-1.73,3.62),(-2.19,2.91),(-2.31,1.85)]
 prism_x(x1,x2,profile,0)
 box((-.42,-1.01,3.645),(1.62,1.51,.095),0)
 box((-.42,-1.77,3.62),(1.58,.05,.10),2)
 # Dark glazing surrounds and inset glass; side window has trapezoidal lower edge.
 cur='cab_glazing'
 side=[(-2.22,1.86),(-.44,1.86),(-.44,2.98),(-1.99,2.98),(-2.12,2.78)]
 for xx,sign in [(x1-.012,-1),(x2+.012,1)]:
  v=[(xx,y,z) for y,z in side];surface(v if sign>0 else v[::-1],2)
  center=np.array(side).mean(0);inset=[center+(np.array(q)-center)*.93 for q in side]
  v=[(xx+sign*.007,y,z) for y,z in inset];surface(v if sign>0 else v[::-1],6)
  # Sliding pane and lower diagonal glass border.
  beam((xx+sign*.014,-1.20,1.89),(xx+sign*.014,-1.20,2.94),.025,.025,2)
  beam((xx+sign*.014,-2.18,2.12),(xx+sign*.014,-.45,2.12),.018,.02,2)
 frontpane=np.array([(x1+.10,-2.321,1.91),(x2-.10,-2.321,1.91),(x2-.10,-2.20,2.88),(x1+.10,-2.20,2.88)])
 surface(frontpane,2);cent=frontpane.mean(0);glass=cent+(frontpane-cent)*.94;glass[:,1]-=.007;surface(glass,6)
 # Rear full-height door and glazing.
 box((-.42,-.287,2.39),(1.31,.025,2.05),2)
 box((-.42,-.267,2.47),(1.16,.025,1.76),6)
 beam((-.99,-.245,2.03),(.15,-.245,2.03),.045,.045,2)
 for xx in [-1.03,.16]:tube((xx,-.235,1.48),(xx,-.235,3.27),.012,2)
 cur='cab_trim'
 # Slim white side identity stripe.
 for xx in [x1-.025,x2+.025]:box((xx,-1.32,1.53),(.025,1.85,.14),8)
 for xx in [x1-.026,x2+.026]:box((xx,-1.28,1.41),(.026,1.93,.045),2)
 beam((-.78,-2.34,2.02),(-.63,-2.27,2.66),.016,.018,2)
 beam((-.92,-2.28,2.64),(-.44,-2.28,2.64),.018,.014,2)
 # Roof seam strips and two lower service panels.
 for xx in [-1.12,.28]:beam((xx,-1.70,3.69),(xx,-.35,3.69),.025,.025,0)
 for yy in [-2.01,-.59]:box((x1-.04,yy,1.66),(.04,.085,.09),3)
 box((x1-.06,-.59,2.06),(.04,.17,.035),2)
 # Side grab handles in cab colour.
 for xx in [x1-.07,x2+.07]:polyline([(xx,-.42,1.51),(xx,-.42,2.99),(xx,-.53,3.04)],.021,0)
 # Mirrors, two per side with brackets.
 cur='mirrors'
 for xx in [-1.44,.60]:
  polyline([(x1 if xx<0 else x2,-2.0,2.87),(xx,-2.05,2.90),(xx,-2.12,2.47)],.016,0)
  for zz,sz in [(2.70,.38),(2.35,.19)]:
   chamfer_box((xx,-2.12,zz),(.17,.10,sz),.025,2)
   box((xx,-2.062,zz),(.13,.016,sz*.8),5)
 cur='engine_cover'
 # Low right-side enclosure and front service vents.
 prism_x(.38,1.19,[(-2.3,1.30),(-.4,1.30),(-.4,1.63),(-.7,1.85),(-1.8,1.85),(-2.3,1.65)],0)
 for yy in np.linspace(-1.9,-.8,10):box((1.204,yy,1.52),(.025,.045,.20),11)
 box((.80,-2.31,1.46),(.65,.04,.24),2)
 cur='bumpers'
 # Steel front bumper with dark horizontal service openings and yellow markings.
 prism_x(-1.25,1.25,[(-2.64,.55),(-2.33,.55),(-2.33,1.13),(-2.68,1.13)],3)
 for zz in [.70,.86,1.02]:chamfer_box((0,-2.69,zz),(1.0,.025,.085),.035,11)
 for xx in [-.85,.85]:
  box((xx,-2.704,.86),(.10,.018,.48),7)
  for zz in [.72,.88,1.04]:tube((xx+.15,-2.69,zz),(xx+.15,-2.715,zz),.035,11,10)
 chamfer_box((0,back,.83),(2.50,.24,.60),.07,3)
 # Rear diagonal hazard plates, split either side of tow point.
 for xlo,xhi in [(-1.15,-.32),(.32,1.15)]:
  box(((xlo+xhi)/2,back+.128,.97),(xhi-xlo,.025,.30),7)
  for x in np.arange(xlo-.2,xhi,.23):
   pts=[(max(xlo,x),back+.146,.82),(min(xhi,x+.11),back+.146,.82),(min(xhi,x+.26),back+.146,1.12),(max(xlo,x+.15),back+.146,1.12)]
   # Clip stripe polygon in x/z to avoid reversed quads at boundaries.
   poly=[(x,.82),(x+.11,.82),(x+.26,1.12),(x+.15,1.12)]
   for bound,keep in [(xlo,1),(xhi,-1)]:
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
     ia=(a[0]-bound)*keep>=0;ib=(b[0]-bound)*keep>=0
     if ia:out.append(a)
     if ia!=ib:
      t=(bound-a[0])/(b[0]-a[0]);out.append((bound,a[1]+t*(b[1]-a[1])))
    poly=out
   if len(poly)>=3:surface([(x,back+.15,z) for x,z in poly][::-1],2)
 box((0,back+.16,.78),(.23,.16,.24),2)
 tube((0,back+.24,.78),(0,back+.26,.78),.064,4,16)
 cur='lights'
 for xx in [-1.07,1.07]:
  # Headlight and amber outer lamp mounted above steel bumper.
  lamp((xx,-2.40,1.32),(.28,.08,.14),8)
  lamp((xx+(-.14 if xx<0 else .14),-2.40,1.32),(.07,.08,.14),9)
  tube((xx,back+.15,1.01),(xx,back+.19,1.01),.10,10,20)
  tube((xx,back+.15,.64),(xx,back+.19,.64),.075,8,16)
 cur='rear_safety_frame'
 # Guard structure behind cab: two posts, top beam, transverse safety member.
 for xx in [-1.08,.24]:
  beam((xx,.08,1.28),(xx,.08,3.63),.115,.14,1)
  for z in np.linspace(1.4,3.50,10):tube((xx,.161,z),(xx,.173,z),.025,5,6)
 beam((-1.13,.08,3.64),(.29,.08,3.64),.12,.14,1)
 beam((-1.08,.08,2.58),(.24,.08,2.58),.10,.13,1)
 for xx in [-1.01,.17]:
  tube((xx,.08,3.68),(xx,.13,3.68),.055,8,14)
 # Exterior exhaust tower and vented thermal shield.
 cur='exhaust'
 tube((.29,.23,1.20),(.29,.23,3.72),.068,3,16)
 polyline([(.29,.23,3.72),(.29,.35,3.82),(.29,.49,3.82)],.07,3)
 for z0,z1,r in [(1.28,1.98,.17),(2.01,2.69,.13),(2.72,3.41,.095)]:
  tube((.29,.23,z0),(.29,.23,z1),r,5,16)
  for z in np.arange(z0+.04,z1-.01,.060):
   for t in np.linspace(0,2*math.pi,12,endpoint=False):
    # Small dark bolt/vent marks on a geometric heat shield.
    a=(.29+(r+.001)*math.cos(t),.23+(r+.001)*math.sin(t),z)
    b=(.29+(r+.008)*math.cos(t),.23+(r+.008)*math.sin(t),z)
    tube(a,b,.012,11,6)
 cur='steps_and_rails'
 for z,yy in [(.35,.30),(.65,.17),(.95,.04)]:
  box((-.43,yy,z),(1.0,.35,.06),3)
  box((-.43,yy+.18,z+.02),(1.0,.022,.025),7)
 for xx in [-1.15,.30]:polyline([(xx,.30,.34),(xx,.30,2.05),(xx,.08,2.17)],.025,0)
 # Utility boxes/fuel tank in square configuration.
 cur='utilities'
 for xx in [-1.04,.99]:
  chamfer_box((xx,.75,.83),(.52,1.28,.56),.045,3)
  for yy in [.19,1.30]:box((xx-.01,yy,.99),(.37,.045,.12),2)
 tube((1.0,.60,1.11),(1.0,.60,1.17),.06,2,12)
 tube((0,-.2,.58),(0,rear,.58),.055,3)
 # Coiled air lines and electrical connection panel on safety frame.
 cur='hoses'
 box((-.39,.18,1.96),(.75,.10,.47),2)
 for xx,col in [(-.65,7),(-.4,10),(-.15,2)]:
  pts=[(xx+.065*math.cos(t*20*math.pi),.30+.065*math.sin(t*20*math.pi),1.57+t*.58) for t in np.linspace(0,1,120)]
  polyline(pts,.011,col)
 cur='fifth_wheel_lift'
 for xx in [-.43,.43]:
  beam((xx,.58,1.02),(xx,rear+.05,1.28),.16,.20,3)
  tube((xx,.88,.85),(xx,1.40,1.24),.085,3)
  tube((xx,1.15,1.04),(xx,1.51,1.32),.045,5)
 box((0,rear,1.27),(1.0,1.1,.10),3)
 cur='fifth_wheel'
 cy=rear+.08;N=48;q=N+1;ang=np.linspace(-math.pi+.24,math.pi-.24,N+1);vs=[]
 for z in [1.32,1.43]:
  for rr in [.105,.74]:vs.extend([(rr*math.sin(t),cy-rr*math.cos(t),z) for t in ang])
 fs=[]
 for i in range(N):
  for aa,bb in [(0,1),(1,3),(3,2),(2,0)]:
   a=aa*q+i;b=bb*q+i;fs.extend([[a,b+1,a+1],[a,b,b+1]])
 for i in [0,N]:
  a=[i,q+i,3*q+i,2*q+i];fs.extend([[a[0],a[2],a[1]],[a[0],a[3],a[2]]])
 add(vs,fs,3)
 # Grease channel detail follows the plate, avoiding the open throat.
 for rr in [.43,.63]:polyline([(rr*math.sin(t),cy-rr*math.cos(t),1.435) for t in np.linspace(-math.pi+.34,math.pi-.34,48)],.007,2)
 tube((-.65,cy-.25,1.34),(-.96,cy-.45,1.34),.023,3)
 cur='branding'
 label([(-1.04,-2.329,1.53),(.17,-2.329,1.53),(.17,-2.329,1.75),(-1.04,-2.329,1.75)],'yt220')
 # Side designation on cab near lower white stripe.
 label([(-1.226,-.68,1.46),(-1.226,-2.07,1.46),(-1.226,-2.07,1.63),(-1.226,-.68,1.63)],'yt220')

def branding(kind):
 img=Image.new('RGB',(1024,224),'#f1f3f1');d=ImageDraw.Draw(img);font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
 d.text((32,8),'TERBERG',font=ImageFont.truetype(font,120),fill='#202b31')
 d.text((36,145),'YT220',font=ImageFont.truetype(font,53),fill='#9c2526')
 return img

def export_glb(kind):
 doc={'asset':{'version':'2.0','generator':'Smarttwin Terberg YT220 refined v2'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[]}
 for name,c,m,r in MATS:doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*c,1],'metallicFactor':m,'roughnessFactor':r}})
 doc['materials'].append({'name':'Original typeset identification','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.5},'doubleSided':True})
 data=bytearray()
 def view(raw,target=None):
  while len(data)%4:data.append(0)
  v={'buffer':0,'byteOffset':len(data),'byteLength':len(raw)}
  if target:v['target']=target
  data.extend(raw);i=len(doc['bufferViews']);doc['bufferViews'].append(v);return i
 def acc(a,typ):
  a=np.array(a,dtype='<f4');v=view(a.tobytes(),34962);d={'bufferView':v,'componentType':5126,'count':len(a),'type':typ}
  if typ=='VEC3':d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
  i=len(doc['accessors']);doc['accessors'].append(d);return i
 def primitive(v,f,mat,uv=None):
  pts=np.array(v)[np.array(f)];cross=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);L=np.linalg.norm(cross,axis=1);assert (L>1e-10).all();norm=cross/L[:,None];vv=pts.reshape(-1,3);nn=smooth_normals(v,f)
  vv=vv[:,[0,2,1]].copy();vv[:,2]*=-1;nn=nn[:,[0,2,1]].copy();nn[:,2]*=-1
  p={'attributes':{'POSITION':acc(vv,'VEC3'),'NORMAL':acc(nn,'VEC3')},'material':mat,'mode':4}
  if uv is not None:p['attributes']['TEXCOORD_0']=acc(np.array(uv)[np.array(f)].reshape(-1,2),'VEC2')
  return p
 tri=0
 for name in dict.fromkeys([k[0] for k in parts] + [x[0] for x in decals]):
  pp=[]
  for (part,mat),(v,f) in parts.items():
   if part==name:pp.append(primitive(v,f,mat));tri+=len(f)
  for part,v,b in decals:
   if part==name:pp.append(primitive(v,[[0,1,2],[0,2,3]],12,[[0,1],[1,1],[1,0],[0,0]]));tri+=2
  mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':pp});ni=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mi});doc['scenes'][0]['nodes'].append(ni)
 tex=branding(kind);bio=io.BytesIO();tex.save(bio,format='PNG');vi=view(bio.getvalue());doc['images']=[{'bufferView':vi,'mimeType':'image/png'}];doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}];doc['textures']=[{'source':0,'sampler':0}]
 doc['extras']={'units':'metres','up':'Y','surfaceFinish':'rounded geometry, crease-aware smooth vertex normals','forward':'+Z','reference':'Terberg YT220 high-rise 4x2 visual approximation','accuracy':'visual approximation from public references, not manufacturer CAD','animation':'no clips; nodes use common-origin mesh coordinates; pivots must be set before rotation','externalAssets':False}
 doc['buffers']=[{'byteLength':len(data)}];js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4);size=12+8+len(js)+8+len(data)
 name='terberg_yt220';path=OUT/(name+'.glb');path.write_bytes(struct.pack('<III',0x46546c67,2,size)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
 verts=np.concatenate([np.array(v) for v,f in parts.values()]);summary={'file':path.name,'triangles':tri,'nodes':len(doc['nodes']),'bytes':size,'dimensions_xyz_m_internal':(verts.max(0)-verts.min(0)).tolist()};print(summary,flush=True);return summary

def render(kind,reverse=False):
 W,H=1600,1180;target=np.array([0,0,1.45]);eye=np.array([-8,-10,6] if not reverse else [8,10,6]);forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,0,1]);right/=np.linalg.norm(right);up=np.cross(right,forward);scale=182
 def project(v):
  v=np.asarray(v)-target;return np.stack([v@right*scale+W/2,-v@up*scale+H/2+20,v@forward],axis=-1)
 im=np.empty((H,W,3),np.uint8);im[:]=[228,235,240];depth=np.full((H,W),np.inf);light=np.array([-3,-4,8.]);light/=np.linalg.norm(light)
 texture=np.array(branding(kind))
 def tri(p,col,uv=None,lighting=None):
  x0=max(0,int(np.floor(p[:,0].min())));x1=min(W-1,int(np.ceil(p[:,0].max())));y0=max(0,int(np.floor(p[:,1].min())));y1=min(H-1,int(np.ceil(p[:,1].max())))
  if x1<x0 or y1<y0:return
  a,b,c=p;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-8:return
  xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5);u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w=1-u-v;z=u*a[2]+v*b[2]+w*c[2]
  mask=(u>=0)&(v>=0)&(w>=0)&(z<depth[y0:y1+1,x0:x1+1]);depth[y0:y1+1,x0:x1+1][mask]=z[mask]
  if uv is None:
   if lighting is None:im[y0:y1+1,x0:x1+1][mask]=col
   else:
    shade=u*lighting[0]+v*lighting[1]+w*lighting[2]
    pixels=np.clip(shade[...,None]*col,0,255).astype(np.uint8)
    im[y0:y1+1,x0:x1+1][mask]=pixels[mask]
  else:
   texuv=u[...,None]*uv[0]+v[...,None]*uv[1]+w[...,None]*uv[2];tx=np.clip((texuv[...,0]*(texture.shape[1]-1)).astype(int),0,texture.shape[1]-1);ty=np.clip((texuv[...,1]*(texture.shape[0]-1)).astype(int),0,texture.shape[0]-1);im[y0:y1+1,x0:x1+1][mask]=texture[ty,tx][mask]
 # Neutral ground and softly layered contact footprint, preview only.
 gg=project([[-5,-5,-.01],[5,-5,-.01],[5,6,-.01],[-5,6,-.01]])
 for ids in [[0,1,2],[0,2,3]]:tri(gg[ids],[217,225,230])
 # Geometry-based projected shadow, blurred only on the preview ground.
 shadow=Image.new('L',(W,H),0);sd=ImageDraw.Draw(shadow)
 for vv,ff in parts.values():
  vv=np.array(vv).copy();vv[:,0]-=vv[:,2]*light[0]/light[2];vv[:,1]-=vv[:,2]*light[1]/light[2];vv[:,2]=.001;pv=project(vv)
  for ids in ff:sd.polygon([tuple(q[:2]) for q in pv[ids]],fill=255)
 alpha=np.array(shadow.filter(ImageFilter.GaussianBlur(7)),float)/255*.19
 im=np.clip(im*(1-alpha[...,None]),0,255).astype(np.uint8)
 for (name,mat),(v,f) in parts.items():
  vv=np.array(v);ff=np.array(f);pv=project(vv);base=np.power(np.array(MATS[mat][1]),1/1.7)*255
  sm=smooth_normals(vv,ff).reshape(-1,3,3)
  half=light-forward;half/=np.linalg.norm(half)
  for ids,nn in zip(ff,sm):
   shade=.48+.52*np.maximum(0,nn@light)
   if mat in [0,3,5,6]:shade+=.16*np.maximum(0,nn@half)**32
   tri(pv[ids],base,lighting=shade)
 for part,v,brand in decals:
  pv=project(v);uv=np.array([[0,1],[1,1],[1,0],[0,0]])
  for ids in [[0,1,2],[0,2,3]]:tri(pv[ids],None,uv[ids])
 img=Image.fromarray(im);d=ImageDraw.Draw(img);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';big=ImageFont.truetype(font,34);small=ImageFont.truetype(font,19)
 d.text((50,35),'TERBERG YT220',font=big,fill='#173c50');d.text((52,82),'Smarttwin / refined geometry v2 / visual approximation',font=small,fill='#536d7d');d.text((52,H-55),'Actual geometry preview · GLB · metres · no animation clips',font=small,fill='#536d7d')
 name='terberg_yt220';img.save(OUT/(name+('_rear' if reverse else '_front')+'.png'))
if __name__=='__main__':
 make();stats=export_glb('yt220');render('yt220');render('yt220',True)
 (OUT/'model_statistics.json').write_text(json.dumps(stats,indent=2))
