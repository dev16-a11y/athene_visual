"""Smarttwin AURORA: original modern feeder container ship, not shipyard CAD.
Python 3 + numpy + Pillow. Internal Z-up -> glTF Y-up, metres.
"""
import math,json,struct,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import container_textures as ct
OUT=Path(__file__).resolve().parent
# (name, linear-ish base color, metallic, roughness)
MATS=[('Midnight blue hull',(.018,.065,.105),.42,.29),('Antifouling red',(.36,.035,.026),.15,.48),('Turquoise accent',(.015,.34,.37),.35,.27),('Ivory superstructure',(.78,.82,.80),.18,.32),('Deck grey green',(.12,.19,.19),.25,.52),('Bridge glazing',(.025,.075,.11),.42,.17),('Marine stainless',(.34,.41,.44),.75,.3),('Black fittings',(.025,.035,.039),.3,.5),('Lifeboat orange',(.94,.22,.035),.2,.32),('Cargo ivory',(.65,.69,.66),.2,.5),('Cargo blue',(.035,.16,.25),.25,.45),('Cargo brick',(.42,.085,.045),.2,.48),('Cargo teal',(.025,.25,.24),.25,.45),('Cargo ochre',(.51,.32,.10),.2,.5),('Cargo grey',(.27,.34,.36),.3,.45),('Propeller bronze',(.46,.27,.08),.8,.28),('Navigation red',(.8,.015,.01),0,.25),('Navigation green',(.015,.50,.14),0,.25)]
cur='hull';parts={}
def face_data(v,f,uv=None,smooth=False):
 v=np.asarray(v,float);f=np.asarray(f,int);p=v[f];cross=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);L=np.linalg.norm(cross,axis=1);keep=L>1e-9;p=p[keep];f=f[keep];cross=cross[keep];L=L[keep];normal=cross/L[:,None]
 if smooth:
  acc=np.zeros_like(v)
  for k in range(3):np.add.at(acc,f[:,k],cross)
  acc/=np.maximum(np.linalg.norm(acc,axis=1)[:,None],1e-12);nx=acc[f].copy();bad=np.sum(cross*nx.mean(1),axis=1)<=0;nx[bad]=normal[bad,None,:];nn=nx.reshape(-1,3)
 else:nn=np.repeat(normal,3,axis=0)
 if uv is None:uu=np.tile([[0,0],[1,0],[1,1]],(len(f),1))
 else:uu=np.asarray(uv,float)[f].reshape(-1,2)
 return p.reshape(-1,3),nn,uu

def add(v,f,mat,uv=None,smooth=False):
 pp,nn,tt=face_data(v,f,uv,smooth);bucket=parts.setdefault((cur,mat),[[],[],[]]);bucket[0].append(pp);bucket[1].append(nn);bucket[2].append(tt)
def quad(v,mat,uv=None):add(v,[[0,1,2],[0,2,3]],mat,uv if uv is not None else [[0,1],[1,1],[1,0],[0,0]])
def beam(a,b,w,d=None,mat=6):
 a=np.array(a,float);b=np.array(b,float);z=b-a;z/=np.linalg.norm(z);ref=np.array([0,0,1.]) if abs(z[2])<.95 else np.array([0,1.,0]);u=np.cross(z,ref);u/=np.linalg.norm(u);v=np.cross(z,u);d=w if d is None else d
 verts=[p+u*s*w/2+v*t*d/2 for p in [a,b] for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 fs=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];add(verts,fs,mat)
def box(c,s,mat=3):
 x,y,z=c;sx,sy,sz=s
 # Independent face UVs support the baked container corrugation material.
 for axis in range(3):
  other=[a for a in range(3) if a!=axis]
  for sign in [-1,1]:
   v=[]
   for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
    p=np.array(c,float);p[axis]+=sign*s[axis]/2;p[other[0]]+=a*s[other[0]]/2;p[other[1]]+=b*s[other[1]]/2;v.append(p)
   if np.cross(np.array(v[1])-v[0],np.array(v[2])-v[0])[axis]*sign<0:v=v[::-1]
   quad(v,mat)
def tube(a,b,r,mat=6,n=12):
 a=np.array(a,float);b=np.array(b,float);z=b-a;z/=np.linalg.norm(z);ref=np.array([0,0,1.]) if abs(z[2])<.95 else np.array([0,1.,0]);u=np.cross(z,ref);u/=np.linalg.norm(u);v=np.cross(z,u)
 verts=[p+r*(u*math.cos(i*2*math.pi/n)+v*math.sin(i*2*math.pi/n)) for p in [a,b] for i in range(n)];fs=[]
 for i in range(n):j=(i+1)%n;fs.extend([[i,j,n+j],[i,n+j,n+i]])
 add(verts,fs,mat,smooth=True)
 for k,sign in [(0,-1),(n,1)]:
  f=[[k,k+i,k+i+1] if sign>0 else [k,k+i+1,k+i] for i in range(1,n-1)];add(verts,f,mat)
def line(pts,r=.045,mat=3,n=8):
 for a,b in zip(pts,pts[1:]):tube(a,b,r,mat,n)
def rounded_box(c,s,r,mat,segments=4):
 c=np.array(c,float);h=np.array(s,float)/2;r=min(r,min(h)*.8);coords=[np.unique(np.r_[np.linspace(-v,-v+r,segments+1),np.linspace(v-r,v,segments+1)]) for v in h];vs=[];fs=[]
 for axis in range(3):
  other=[a for a in range(3) if a!=axis]
  for sign in [-1,1]:
   start=len(vs);aa,bb=coords[other[0]],coords[other[1]]
   for x in aa:
    for y in bb:
     q=np.zeros(3);q[axis]=sign*h[axis];q[other[0]]=x;q[other[1]]=y;inside=np.clip(q,-h+r,h-r);delta=q-inside;vs.append(c+inside+r*delta/np.linalg.norm(delta))
   for i in range(len(aa)-1):
    for j in range(len(bb)-1):
     a=start+i*len(bb)+j;b=a+len(bb);cc=b+1;d=a+1
     if np.cross(np.array(vs[b])-vs[a],np.array(vs[cc])-vs[a])[axis]*sign>0:fs.extend([[a,b,cc],[a,cc,d]])
     else:fs.extend([[a,cc,b],[a,d,cc]])
 # Normals use known rounded-box analytical field, shared between face patches.
 p=np.array(vs);f=np.array(fs);pp=p[f];rel=p-c;inn=np.clip(rel,-h+r,h-r);norm=rel-inn;norm/=np.linalg.norm(norm,axis=1)[:,None]
 bucket=parts.setdefault((cur,mat),[[],[],[]]);bucket[0].append(pp.reshape(-1,3));bucket[1].append(norm[f].reshape(-1,3));bucket[2].append(np.tile([[0,0],[1,0],[1,1]],(len(f),1)))
def sphere(c,s,mat=3,n=24,m=12):
 vs=[];fs=[]
 for j in range(m+1):
  t=math.pi*j/m
  for i in range(n):a=2*math.pi*i/n;vs.append(np.array(c)+np.array(s)*[math.sin(t)*math.cos(a),math.sin(t)*math.sin(a),math.cos(t)])
 for j in range(m):
  for i in range(n):k=(i+1)%n;a=j*n+i;b=j*n+k;cc=(j+1)*n+k;d=(j+1)*n+i;fs.extend([[a,d,cc],[a,cc,b]])
 add(vs,fs,mat,smooth=True)
def rail(pts,zoff=0,mat=3):
 pp=[np.array(p,float)+[0,0,zoff] for p in pts]
 line([p+[0,0,1.05] for p in pp],.045,mat);line([p+[0,0,.55] for p in pp],.027,mat)
 for p in pp:tube(p,p+[0,0,1.05],.038,mat,8)
def ss(t):return np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
def breadth(t):return 14.4*ss(t/.24)**.72*(1-.35*ss((t-.83)/.17))
def fore(z):return np.interp(z,[-7.3,-6,-4,-2,0,3,8.8],[-76,-83,-90,-92,-90,-91.5,-94])
def aft(z):return np.interp(z,[-7.3,-4,0,8.8],[78,83,88.8,89])
def sample_curve(pts,steps=5):
 pts=np.array(pts,float);out=[]
 for i in range(len(pts)-1):
  p0=pts[max(0,i-1)];p1=pts[i];p2=pts[i+1];p3=pts[min(len(pts)-1,i+2)]
  for t in np.linspace(0,1,steps,endpoint=False):out.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 out.append(pts[-1]);return np.array(out)

# Replace only cargo paint definitions. Hull, deck and accommodation are untouched.
for _i,_cfg in enumerate(ct.LINES):
 _c=tuple((v/255)**2.2 for v in _cfg['rgb'])
 MATS[9+_i]=('Container line: '+_cfg['name'],_c,.15,.5)
LOAD_PLAN=[]

def cargo_box(c,s,mat):
 x,y,z=c;hx,hy,hz=np.array(s)/2
 # Long sides: maintain left-to-right text on both port and starboard.
 for side in [-1,1]:
  yy=[hy,-hy,-hy,hy] if side<0 else [-hy,hy,hy,-hy]
  v=[(x+side*hx,y+dy,z+dz) for dy,dz in zip(yy,[-hz,-hz,hz,hz])]
  quad(v,mat,[[0,.5],[1,.5],[1,0],[0,0]])
 # Door markings at both ends.
 for side in [-1,1]:
  xx=[-hx,hx,hx,-hx] if side<0 else [hx,-hx,-hx,hx]
  v=[(x+dx,y+side*hy,z+dz) for dx,dz in zip(xx,[-hz,-hz,hz,hz])]
  quad(v,mat,[[0,1],[.25,1],[.25,.5],[0,.5]])
 # Roof and underside sample only the plain roof part of the atlas.
 for side in [-1,1]:
  v=[(x-hx,y-hy,z+side*hz),(x+hx,y-hy,z+side*hz),(x+hx,y+hy,z+side*hz),(x-hx,y+hy,z+side*hz)]
  if side<0:v=v[::-1]
  quad(v,mat,[[.25,1],[1,1],[1,.5],[.25,.5]])

def make():
 global cur
 # The hull is a continuous loft with rounded bilges, bulbous entry and flared bow.
 cur='hull'
 profile=sample_curve([[-1,8.8],[-1.008,4],[-.98,0],[-.92,-3],[-.72,-5.7],[-.42,-7.1],[0,-7.3],[.42,-7.1],[.72,-5.7],[.92,-3],[.98,0],[1.008,4],[1,8.8]],6)
 vs=[];N=151
 for t in np.linspace(0,1,N):
  for xr,z in profile:vs.append((breadth(t)*xr,fore(z)+(aft(z)-fore(z))*t,z))
 vs=np.array(vs);q=len(profile)
 # Accumulate smooth normals before splitting the hull by paint color.
 fs=[]
 for i in range(N-1):
  for j in range(q-1):a=i*q+j;b=(i+1)*q+j;fs.extend([[a,b,b+1],[a,b+1,a+1]])
 f=np.array(fs);p=vs[f];cross=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);L=np.linalg.norm(cross,axis=1);valid=L>1e-9;f=f[valid];cross=cross[valid];norm=np.zeros_like(vs)
 for k in range(3):np.add.at(norm,f[:,k],cross)
 norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-12)
 for mat,mask in [(0,vs[f].mean(1)[:,2]>=0),(1,vs[f].mean(1)[:,2]<0)]:
  ff=f[mask];nx=norm[ff].copy();cp=np.cross(vs[ff[:,1]]-vs[ff[:,0]],vs[ff[:,2]]-vs[ff[:,0]]);bad=np.sum(cp*nx.mean(1),axis=1)<=0
  nx[bad]=cp[bad,None,:]/np.linalg.norm(cp[bad],axis=1)[:,None,None]
  bucket=parts.setdefault((cur,mat),[[],[],[]]);bucket[0].append(vs[ff].reshape(-1,3));bucket[1].append(nx.reshape(-1,3));bucket[2].append(np.tile([[0,0],[1,0],[1,1]],(len(ff),1)))
 # A full rounded bulb, intersecting the forebody below the waterline.
 cur='bulbous_bow'
 sphere((0,-90.8,-3.3),(2.65,5.5,2.05),1,48,24)
 cur='hull'
 # Closed transom. Deck cap has an independent, flat normal.
 half=profile[:(len(profile)+1)//2][::-1];v=[]
 for xr,z in half:v.extend([(-breadth(1)*abs(xr),aft(z),z),(breadth(1)*abs(xr),aft(z),z)])
 v=np.array(v);f=[]
 for i in range(len(half)-1):f.extend([[2*i,2*i+3,2*i+1],[2*i,2*i+2,2*i+3]])
 f=np.array(f)
 for mat,mask in [(0,v[f].mean(1)[:,2]>=0),(1,v[f].mean(1)[:,2]<0)]:add(v,f[mask],mat,smooth=True)
 cur='main_deck'
 deck=[]
 for t in np.linspace(0,1,N):deck.extend([(-breadth(t),-94+183*t,8.8),(breadth(t),-94+183*t,8.8)])
 add(deck,[[2*i,2*i+1,2*i+3] for i in range(N-1)]+[[2*i,2*i+3,2*i+2] for i in range(N-1)],4)
 # Waterline highlight and sheer accent ribbons follow hull geometry.
 cur='hull_accents'
 for side in [-1,1]:
  for z0,z1,mat in [(.28,.52,2),(7.70,7.87,3)]:
   for t0,t1 in zip(np.linspace(.015,1,151)[:-1],np.linspace(.015,1,151)[1:]):
    def pt(t,z):return (side*breadth(t)*np.interp(z,profile[:,1] if False else [0,4,8.8],[.98,1.008,1]),fore(z)+(aft(z)-fore(z))*t,z)
    v=[pt(t0,z0),pt(t1,z0),pt(t1,z1),pt(t0,z1)];v=np.array(v);v[:,0]+=side*.035
    quad(v if side>0 else v[::-1],mat)
 # Safety rails along port and starboard, fore and aft deck.
 cur='deck_rails'
 for side in [-1,1]:
  pts=[]
  for t in np.linspace(.025,1,69):pts.append((side*(breadth(t)-.25),-94+183*t,8.95))
  rail(pts,mat=3)
 # Bow mooring station, anchor gear, breakwater and raised forecastle details.
 cur='foredeck_fittings'
 for side in [-1,1]:
  for yy in [-80,-73]:
   xx=side*min(5.5,breadth((yy+94)/183)*.65)
   box((xx,yy,9.02),(1.6,1.0,.22),6)
   for dx in [-.45,.45]:tube((xx+dx,yy,9.1),(xx+dx,yy,9.78),.16,6,14)
  box((side*4.8,-73,9.18),(2,2.7,.5),4)
  tube((side*4.8,-73,9.45),(side*4.8,-73,10),.50,6,20)
 for yy in [-86,-79]:rounded_box((0,yy,9.0),(2.8,2,.35),.12,3)
 # Curved breakwater plate ahead of the first container bay.
 for x0,x1 in zip(np.linspace(-8,8,17)[:-1],np.linspace(-8,8,17)[1:]):beam((x0,-68.3+abs(x0)*.12,9.5),(x1,-68.3+abs(x1)*.12,9.5),.10,1.20,3)
 # Anchor silhouettes on both bow shoulders.
 for side in [-1,1]:
  xx=side*9.5;yy=-69
  rounded_box((xx,yy,3.4),(.3,2.6,1.15),.12,7)
  beam((xx+side*.22,yy,3.9),(xx+side*.22,yy,2.3),.20,.20,6)
  line([(xx+side*.22,yy-1,2.6),(xx+side*.22,yy,2.15),(xx+side*.22,yy+1,2.6)],.17,6)
 # Containers: 40ft bays, restrained palette, stepped loading silhouette.
 cargo_count=0;LOAD_PLAN.clear()
 for bay,yy in enumerate(np.arange(-59,43,12.5)):
  cur='hatch_covers'
  rows=8 if bay==0 else 10
  rounded_box((0,yy,9.0),(rows*2.53+.15,12.36,.38),.10,4,3)
  cur=f'cargo_bay_{bay+1:02d}'
  li=ct.line_index(bay);mat=9+li;trim=19+li;bay_count=0
  for row in range(rows):
   xx=(row-(rows-1)/2)*2.53
   tiers=2 if bay==0 else (3 if bay in [1,8] else 4)
   if bay in [3,4,5] and abs(xx)<8:tiers=5
   if bay==7 and row in [0,9]:tiers=3
   for tier in range(tiers):
    zz=9.2+1.295+tier*2.68;cargo_box((xx,yy,zz),(2.438,12.192,2.59),mat);cargo_count+=1;bay_count+=1
    # Fine corner uprights (only exposed outer rows) and top rails on upper tier.
    if row in [0,rows-1]:
     for dy in [-6.04,6.04]:beam((xx+(-1.23 if row==0 else 1.23),yy+dy,zz-1.24),(xx+(-1.23 if row==0 else 1.23),yy+dy,zz+1.24),.055,.06,trim)
    if tier==tiers-1:
     for dx in [-1.18,1.18]:beam((xx+dx,yy-6.03,zz+1.28),(xx+dx,yy+6.03,zz+1.28),.045,.045,trim)
     # End door seam and locking bars on visible ends.
     for dy in [-6.102,6.102]:
      beam((xx,yy+dy,zz-1.17),(xx,yy+dy,zz+1.17),.025,.025,6)
      for dx in [-.7,.7]:tube((xx+dx,yy+dy,zz-1.05),(xx+dx,yy+dy,zz+1.05),.018,6,6)
  LOAD_PLAN.append({'bay':bay+1,'node':cur,'carrier':ct.LINES[li]['name'],'containers':bay_count,'centreY_internal':float(yy)})
 # Accommodation block aft, rounded sheet-metal decks and rhythmic glazing.
 cur='accommodation'
 for level in range(6):
  z=10.0+level*3.10;w=21.0 if level<4 else 20.0
  rounded_box((0,57,z+1.4),(w,16.8,2.95),.18,3)
  box((0,57,z-.08),(w+.45,17.2,.18),3)
  # Window rows on front, sides and aft.
  for x in np.linspace(-8.3,8.3,10):rounded_box((x,48.57,z+1.9),(1.05,.07,.74),.10,5,3)
  for side in [-1,1]:
   for y in np.linspace(50.2,63.8,8):rounded_box((side*(w/2+.035),y,z+1.9),(.07,1.04,.74),.10,5,3)
  for x in np.linspace(-8,8,9):rounded_box((x,65.44,z+1.9),(1.05,.07,.74),.10,5,3)
 # Bridge and projecting wings, black wraparound glazing and white brows.
 cur='bridge'
 rounded_box((0,56.8,28.68),(22.5,17.6,.65),.15,3)
 rounded_box((0,56.8,30.5),(24,17.6,3.2),.40,3)
 rounded_box((0,56.8,32.35),(25.2,18.7,.50),.18,3)
 for x in np.linspace(-10.5,10.5,15):
  rounded_box((x,47.96,30.8),(1.32,.085,1.75),.08,5,3)
 for side in [-1,1]:
  rounded_box((side*14,54.2,29.50),(5.3,8.8,.42),.15,3)
  rounded_box((side*15,53.5,30.2),(2.8,6,1.25),.18,3)
  rounded_box((side*15,50.45,30.6),(2.3,.08,.75),.08,5,3)
  rail([(side*16.5,y,29.75) for y in np.linspace(49.9,58.4,7)],mat=3)
  tube((side*16.6,50.4,30.8),(side*16.6,50.4,31),.12,16 if side<0 else 17,12)
 # Rear service stair flights and platform rails.
 cur='service_access'
 for level in range(5):
  za=10+level*3.1;xa,xb=(-8,-3) if level%2==0 else (-3,-8)
  for yy in [66.0,67.0]:beam((xa,yy,za),(xb,yy,za+3.1),.09,.14,6)
  for t in np.linspace(0,1,14):box((xa+(xb-xa)*t,66.5,za+3.1*t),(.45,1.04,.06),6)
  line([(xa,67.05,za+1),(xb,67.05,za+4.1)],.038,3)
 # Funnel with swept upper profile and black exhaust openings.
 cur='funnel'
 rounded_box((1.5,75,9.15),(8.4,8.2,.8),.20,0)
 rounded_box((1.5,75,17.0),(8.2,8.0,15.2),.55,0)
 rounded_box((1.5,75,24.8),(8.4,8.2,1.0),.25,2)
 for x in [-.5,1.5,3.5]:tube((x,75,25.1),(x,75,26.5),.72,7,20)
 for side in [-1,1]:
  for y in np.linspace(72.3,77.7,8):box((1.5+side*4.15,y,16.2),(.08,.25,4.5),7)
 # Radars, antennas, satellite domes, mast and deck lamps.
 cur='navigation_equipment'
 tube((0,56.7,32.6),(0,56.7,40),.16,3,16)
 for z,w in [(35.2,8),(38,4.7)]:
  beam((-w/2,56.7,z),(w/2,56.7,z),.16,.16,3)
  for side in [-1,1]:tube((side*w/2,56.7,z),(side*w/2,56.7,z+1.1),.05,3)
 rounded_box((0,56.7,36.1),(4.8,.45,.32),.12,3)
 for x,y in [(-7,58),(7,58)]:
  tube((x,y,32.6),(x,y,33.4),.5,3,16);sphere((x,y,34.3),(1.05,1.05,1.25),3,24,12)
 for x,y in [(-10,62),(10,62),(-8,50),(8,50)]:tube((x,y,32.6),(x,y,35.2),.038,6,8)
 # Enclosed rescue/lifeboats with davits on both sides.
 cur='lifeboats'
 for side in [-1,1]:
  sphere((side*12.2,60,14.1),(1.25,4.6,1.15),8,28,14)
  rounded_box((side*12.2,59.3,15.05),(1.4,3.1,.65),.25,8)
  rounded_box((side*12.2,57.7,15.14),(1.05,.08,.35),.04,5)
  for yy in [56.8,63.2]:
   line([(side*10.3,yy,11),(side*10.3,yy,17),(side*13.1,yy,17)],.13,3)
   tube((side*13.1,yy,17),(side*12.2,yy,14.5),.023,6,6)
 # Stern mooring, bollards, rudder and five-blade propeller.
 cur='stern_fittings'
 for x in [-7,7]:
  box((x,83,9),(2,2,.3),4);tube((x,83,9.15),(x,83,9.8),.45,6,16)
 rounded_box((0,83,9.25),(3,2.2,.7),.15,3)
 cur='underwater_appendages'
 tube((0,73,-4.4),(0,84.1,-4.4),.34,6,20)
 sphere((0,83.4,-4.4),(.72,1.3,.72),15,24,12)
 for k in range(5):
  a=2*math.pi*k/5;vs=[]
  for r,t,dy in [(0.45,-.18,0),(1.6,-.1,.2),(2.55,.16,.4),(2.5,.43,.5),(1.3,.5,.1),(.45,.28,0)]:vs.append((r*math.cos(a+t),83.7+dy,-4.4+r*math.sin(a+t)))
  add(vs,[[0,1,2],[0,2,3],[0,3,4],[0,4,5]],15)
 rounded_box((0,87,-3.9),(.45,3.3,6.0),.16,0)
 # Hull identities are fitted to the side rather than floating in space.
 cur='identity'
 # Textured strips follow the sampled hull section, on both sides.
 section=profile[profile[:,0]<=0];section=section[np.argsort(section[:,1])]
 def hull_coefficient(z):return np.interp(z,section[:,1],-section[:,0])
 for side in [-1,1]:
  y0,y1=-34,12;z0,z1=3.3,6.8;verts=[];uv=[]
  for i,y in enumerate(np.linspace(y0,y1,17)):
   for z in [z0,z1]:
    t=(y-fore(z))/(aft(z)-fore(z));x=side*(breadth(t)*hull_coefficient(z)+.12);verts.append((x,y,z));uv.append((1-i/16 if side<0 else i/16,1 if z==z0 else 0))
  f=[]
  for i in range(16):
   a=2*i;b=a+2
   f.extend([[a,b,b+1],[a,b+1,a+1]] if side>0 else [[a,b+1,b],[a,a+1,b+1]])
  add(verts,f,18,uv)
 return cargo_count

def texture_bytes():
 # Original wordmark and a tangent-space corrugation normal map.
 img=Image.new('RGBA',(2048,256),(0,0,0,0));d=ImageDraw.Draw(img);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',150)
 d.text((60,26),'SMARTTWIN  /  AURORA',font=font,fill=(230,241,240,255));bio=io.BytesIO();img.save(bio,format='PNG');logo=bio.getvalue()
 W=512;H=256;u=np.arange(W)/W;gradient=1.7*np.sin(u*2*math.pi*44);n=np.stack([-gradient,np.zeros(W),np.ones(W)],axis=1);n/=np.linalg.norm(n,axis=1)[:,None];a=np.tile(((n+1)*127.5).astype(np.uint8)[None,:,:],(H,1,1));a[:8]=[128,128,255];a[-8:]=[128,128,255]
 im=Image.fromarray(a);bio=io.BytesIO();im.save(bio,format='PNG');return logo,ct.png(ct.normal_atlas())

def export(cargo_count):
 doc={'asset':{'version':'2.0','generator':'Smarttwin AURORA branded cargo v2'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[]};data=bytearray()
 def view(raw,target=None):
  while len(data)%4:data.append(0)
  obj={'buffer':0,'byteOffset':len(data),'byteLength':len(raw)}
  if target:obj['target']=target
  data.extend(raw);i=len(doc['bufferViews']);doc['bufferViews'].append(obj);return i
 def acc(a,typ,component=5126,target=34962):
  a=np.asarray(a,dtype='<f4' if component==5126 else '<u4');v=view(a.tobytes(),target);obj={'bufferView':v,'componentType':component,'count':len(a),'type':typ}
  if typ=='VEC3':obj.update(min=a.min(0).tolist(),max=a.max(0).tolist())
  i=len(doc['accessors']);doc['accessors'].append(obj);return i
 for i,(name,c,m,r) in enumerate(MATS):
  mat={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*c,1],'metallicFactor':m,'roughnessFactor':r}}
  if i in range(9,14):
   mat['pbrMetallicRoughness']['baseColorFactor']=[1,1,1,1]
   mat['pbrMetallicRoughness']['baseColorTexture']={'index':2+i-9}
   mat['normalTexture']={'index':1,'scale':.42}
  if i==15:mat['doubleSided']=True
  doc['materials'].append(mat)
 doc['materials'].append({'name':'Hull identity','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':.1,'roughnessFactor':.45},'alphaMode':'MASK','alphaCutoff':.4,'doubleSided':True})
 for cfg in ct.LINES:
  doc['materials'].append({'name':cfg['name']+' edge paint','pbrMetallicRoughness':{'baseColorFactor':[*[(v/255)**2.2 for v in cfg['rgb']],1],'metallicFactor':.15,'roughnessFactor':.5}})
 triangle_count=0;vertex_count=0
 for name in dict.fromkeys(k[0] for k in parts):
  prim=[]
  for (part,mat),(pp,nn,tt) in parts.items():
   if part!=name:continue
   p=np.concatenate(pp).astype('<f4');n=np.concatenate(nn).astype('<f4');uv=np.concatenate(tt).astype('<f4');p=p[:,[0,2,1]].copy();p[:,2]*=-1;n=n[:,[0,2,1]].copy();n[:,2]*=-1
   # Indexed vertices reduce duplicated positions, normals and UVs.
   combined=np.concatenate([p,n,uv],axis=1);unique,idx=np.unique(combined,axis=0,return_inverse=True);vertex_count+=len(unique);triangle_count+=len(idx)//3
   prim.append({'attributes':{'POSITION':acc(unique[:,:3],'VEC3'),'NORMAL':acc(unique[:,3:6],'VEC3'),'TEXCOORD_0':acc(unique[:,6:],'VEC2')},'indices':acc(idx,'SCALAR',5125,34963),'material':mat,'mode':4})
  mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':prim});ni=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mi});doc['scenes'][0]['nodes'].append(ni)
 imgs=[]
 for raw in list(texture_bytes()) + [ct.png(ct.atlas(i)) for i in range(5)]:imgs.append({'bufferView':view(raw),'mimeType':'image/png'})
 doc['images']=imgs;doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}];doc['textures']=[{'source':i,'sampler':0} for i in range(7)]
 doc['extras']={'units':'metres','up':'Y','forward':'+Z','origin':'waterline at ship centre','name':'AURORA','type':'original visual concept, not naval engineering model','containerCount':cargo_count,'cargoGroups':LOAD_PLAN,'nominalLengthMetres':183,'nominalBeamMetres':29,'animation':'no animation clips; grouped cargo bays and ship systems'}
 doc['buffers']=[{'byteLength':len(data)}];js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4);size=12+8+len(js)+8+len(data)
 (OUT/'smarttwin_aurora_container_ship.glb').write_bytes(struct.pack('<III',0x46546c67,2,size)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
 allp=np.concatenate([np.concatenate(v[0]) for v in parts.values()]);report={'triangles':triangle_count,'indexed_vertices':vertex_count,'nodes':len(doc['nodes']),'materials':len(doc['materials']),'containers':cargo_count,'bytes':size,'bounds_internal_xyz':[allp.min(0).tolist(),allp.max(0).tolist()]};(OUT/'cargo_layout.json').write_text(json.dumps(LOAD_PLAN,indent=2,ensure_ascii=False));(OUT/'model_statistics.json').write_text(json.dumps(report,indent=2));print(report,flush=True)
if __name__=='__main__':
 ct.create_files();export(make())
