"""Original visual railway assets for Афина. Metres, glTF Y-up, +Z forward.
Rebuild: python build_railway.py (numpy, Pillow). Not manufacturer CAD.
"""
import math,json,struct
from pathlib import Path
import numpy as np
import geometry as g
P=Path(__file__).resolve().parent
M=[('Enamel teal',(.023,.255,.285),.35,.28),('Ivory enamel',(.73,.79,.77),.25,.32),('Frame graphite',(.045,.064,.077),.65,.38),('Cast steel',(.16,.20,.23),.75,.42),('Polished steel',(.53,.59,.62),.90,.24),('Glass blue',(.025,.095,.135),.48,.12),('Rubber seals',(.014,.021,.026),0,.7),('Safety yellow',(.95,.60,.035),.25,.34),('Light lens',(.83,.94,1.),.15,.19),('Red lens',(.65,.022,.018),.15,.25),('Grilles',(.018,.029,.034),.25,.66),('Blue enamel',(.034,.14,.36),.38,.29),('Wine enamel',(.30,.025,.045),.35,.30),('Oxide freight',(.32,.075,.038),.25,.55),('Sand enamel',(.65,.53,.30),.23,.48),('Tank silver',(.61,.68,.71),.64,.30),('Timber deck',(.26,.18,.105),0,.8),('Coal',(.027,.032,.038),.12,.87)]
CFG={
 'diesel_shunter_6axle':('Маневровый тепловоз · 6 осей',16.8,'shunter'),
 'diesel_industrial_4axle':('Промышленный тепловоз · 4 оси',12.6,'industrial'),
 'diesel_mainline_2section':('Магистральный тепловоз · 2 секции',36.0,'mainline'),
 'wagon_container_platform':('Фитинговая платформа · 2 × 40 футов',26.0,'container'),
 'wagon_gondola':('Полувагон',13.8,'gondola'),
 'wagon_grain_hopper':('Зерновоз',15.0,'hopper'),
 'wagon_tank':('Цистерна',12.8,'tank'),
 'wagon_covered':('Крытый вагон',15.6,'covered'),
 'wagon_pipe_platform':('Платформа с трубами',14.6,'pipes')}
ANCHORS={}
def part(n):g.cur=n
def box(c,s,m=2,r=0):
 if r and min(s)>.075:g.rounded_box(c,s,r,m,2)
 else:g.box(c,s,m)
def cyl(a,b,r,m=3,n=24):g.tube(a,b,r,m,n)
def rail(points,m=4,r=.022):g.polyline(points,r,m)
def rounded_loft(rows,m):
 # Rows (z,width,yfront,yrear,corner radius). Rings are CCW viewed from above.
 rings=[]
 for z,w,a,b,r in rows:
  outline=g.round_outline([[-w/2,a],[w/2,a],[w/2,b],[-w/2,b]],r,5)
  rings.append([(x,y,z) for x,y in outline])
 n=len(rings[0]);v=sum(rings,[]);f=[]
 for k in range(len(rings)-1):
  for i in range(n):j=(i+1)%n;u=k*n+i;vv=k*n+j;f.extend([[u,vv,vv+n],[u,vv+n,u+n]])
 for i in range(1,n-1):f.extend([[0,i+1,i],[(len(rings)-1)*n,(len(rings)-1)*n+i,(len(rings)-1)*n+i+1]])
 g.add(v,f,m)
def oriented_surface(v,m,expected):
 f=[[0,i,i+1] for i in range(1,len(v)-1)];v=np.asarray(v,float)
 for t in f:
  if np.dot(np.cross(v[t[1]]-v[t[0]],v[t[2]]-v[t[0]]),expected)<0:t[1],t[2]=t[2],t[1]
 g.add(v,f,m)
def lathe_y(yz,profile,m,n=48):
 # Profile (longitudinal y,radius), closed ends, used for rounded tank.
 y0,z0=yz;v=[]
 for y,r in profile:v.extend([(r*math.cos(t),y0+y,z0+r*math.sin(t)) for t in np.linspace(0,2*math.pi,n,endpoint=False)])
 f=[]
 for k in range(len(profile)-1):
  for i in range(n):j=(i+1)%n;a=k*n+i;b=k*n+j;c=(k+1)*n+j;d=(k+1)*n+i;f.extend([[a,c,b],[a,d,c]])
 for k,sign in [(0,-1),(len(profile)-1,1)]:
  center=len(v);v.append((0,y0+profile[k][0],z0))
  for i in range(n):
   j=(i+1)%n;t=[center,k*n+i,k*n+j]
   cr=np.cross(np.array(v[t[1]])-v[t[0]],np.array(v[t[2]])-v[t[0]])
   if cr[1]*sign<0:t[1],t[2]=t[2],t[1]
   f.append(t)
 g.add(v,f,m)
def spring(x,y,z):
 pts=[(x+.085*math.cos(t),y+.085*math.sin(t),z+.025*t/(2*math.pi)) for t in np.linspace(0,10*math.pi,45)]
 rail(pts,3,.022)
def wheel(x,y,name,r=.46):
 part(name);sign=1 if x>0 else -1;z=r+.18
 # The wide polished tread and inner flange are steel, not rubber tyres.
 cyl((x-.072,y,z),(x+.072,y,z),r,4,40)
 xf=x-sign*.075;cyl((xf-sign*.014,y,z),(xf+sign*.014,y,z),r+.032,3,40)
 cyl((x-.075,y,z),(x+.075,y,z),r*.79,3,32)
 cyl((x+sign*.076,y,z),(x+sign*.099,y,z),r*.40,4,24)
 cyl((x+sign*.10,y,z),(x+sign*.16,y,z),r*.21,3,20)
 for t in np.linspace(0,2*math.pi,8,endpoint=False):
  yy=y+.125*math.cos(t);zz=z+.125*math.sin(t);cyl((x+sign*.10,yy,zz),(x+sign*.12,yy,zz),.018,4,6)
def bogie(y,axles=2,prefix='bogie',r=.46):
 ys=np.linspace(-.96,.96,axles) if axles==2 else [-1.65,0,1.65]
 for j,dy in enumerate(ys):
  yy=y+dy
  for s in [-1,1]:wheel(s*.83,yy,f'{prefix}_wheel_{j}_{"L" if s<0 else "R"}',r)
  part(prefix+'_axles');cyl((-.88,yy,r+.18),(.88,yy,r+.18),.075,3,16)
 part(prefix+'_frame');length=(max(ys)-min(ys))+1.05
 for s in [-1,1]:
  x=s*1.05;box((x,y,.96),(.19,length,.28),3,.08)
  box((x,y,1.12),(.22,length-.5,.16),2,.055)
  for dy in ys:
   box((x,y+dy,.70),(.29,.42,.26),3,.06)
   box((x+s*.16,y+dy,.72),(.035,.22,.16),4,.025)
   for dz in [-.27,.27]:spring(x,y+dy+dz,1.00)
   # Brake shoes and levers.
   for a in [-.43,.43]:box((s*.82,y+dy+a,.68),(.13,.12,.26),2,.03)
  rail([(x,y-length/2,1.24),(x,y,1.32),(x,y+length/2,1.24)],3,.055)
 for yy in [y-length*.30,y+length*.30]:box((0,yy,1.04),(2.1,.24,.20),3,.04)
 box((0,y,1.22),(1.3,.52,.22),2,.05)
def coupler(y,sgn,prefix):
 part(prefix);box((0,y-sgn*.17,1.03),(.38,.54,.26),3,.04)
 box((0,y+sgn*.18,1.03),(.29,.28,.32),3,.055)
 box((sgn*.10,y+sgn*.29,1.03),(.24,.14,.20),3,.035)
 for s in [-1,1]:rail([(s*.42,y-sgn*.23,1.15),(s*.42,y+sgn*.02,.78),(s*.23,y+sgn*.05,.68)],6,.028)
def chassis(L,bogie_centres,axles=2,prefix='',loco=False):
 part(prefix+'underframe')
 for x in [-1.10,1.10]:box((x,0,1.32),(.22,L-.5,.32),2,.045)
 box((0,0,1.32),(1.05,L-.8,.28),3,.03)
 for y in np.arange(-L/2+.8,L/2,.95):box((0,y,1.37),(2.8,.10,.18),3,.02)
 for j,y in enumerate(bogie_centres):bogie(y,axles,prefix+f'bogie_{j}',.50 if loco else .46)
 part(prefix+'brake_equipment');cyl((-.45,0,.99),(-.45,1.10,.99),.18,3);box((.50,-.3,1.02),(.6,1.2,.35),2,.04)
 rail([(-.7,-L/2+.6,1.05),(-.7,L/2-.6,1.05)],3,.021)
 for y,s in [(-L/2,-1),(L/2,1)]:coupler(y,s,prefix+('coupler_front' if s<0 else 'coupler_rear'))
def handrails(L,y0=0):
 part('walkway_handrails')
 for x in [-1.49,1.49]:
  for y in np.linspace(-L/2+.65,L/2-.65,max(6,int(L))):cyl((x,y,1.59),(x,y,2.52),.022,4,8)
  rail([(x,-L/2+.6,2.51),(x,L/2-.6,2.51)],4,.026)
  rail([(x,-L/2+.6,2.05),(x,L/2-.6,2.05)],4,.018)
 for y in [-L/2+.35,L/2-.35]:
  for x in [-.95,.95]:cyl((x,y,1.60),(x,y,2.35),.025,7,10)
  rail([(-.95,y,2.35),(.95,y,2.35)],7,.026)
def steps(L):
 part('access_steps')
 for y in [-L/2+.55,L/2-.55]:
  for s in [-1,1]:
   for j in range(3):
    z=.67+j*.29;box((s*(1.40-j*.07),y,z),(.40,.62,.07),3,.02)
    for yy in np.linspace(y-.24,y+.24,6):box((s*(1.40-j*.07),yy,z+.04),(.32,.016,.01),4)
   rail([(s*1.60,y-.35,.8),(s*1.60,y-.35,2.3)],7,.024)
def cab(y,length=2.6,front=True,paint=0,prefix='cab'):
 # Sloping nose with rounded shoulders, independent dark glass panes and seals.
 part(prefix+'_shell');a=y-length/2;b=y+length/2
 rounded_loft([(1.58,3.06,a,b,.16),(2.0,3.08,a,b,.18),(3.52,2.813073,a+.474537,b-.207610,.22),(4.05,2.72,a+.64,b-.28,.25),(4.19,2.58,a+.77,b-.36,.28)],paint)
 part(prefix+'_roof');box((0,y+.16,4.13),(2.77,length-.50,.20),1,.13)
 part(prefix+'_glazing')
 def fy(z):return a+(z-2)*.64/2.05-.028
 def wx(z):return (3.08-(z-2)*.36/2.05)/2+.028
 for s in [-1,1]:
  # Windshield planes follow the raked front face.
  verts=[(s*.07,fy(2.98),2.98),(s*1.32,fy(2.98),2.98),(s*1.22,fy(3.84),3.84),(s*.07,fy(3.84),3.84)]
  oriented_surface(verts,5,[0,-1,.3]);rail(verts+[verts[0]],6,.024)
  xx=s*wx(2.94)
  verts=[(xx,a+.49,2.94),(xx,b-.35,2.94),(s*wx(3.83),b-.43,3.83),(s*wx(3.83),a+.76,3.83)]
  oriented_surface(verts,5,[s,0,.1]);rail(verts+[verts[0]],6,.024)
  # Small door, inset handle, side mirror on thin support.
  part(prefix+'_details');box((s*1.545,b-.25,2.52),(.028,.07,.16),4,.015)
  rail([(s*1.48,a+.86,3.46),(s*1.80,a+.60,3.46)],4,.023)
  box((s*1.80,a+.56,3.45),(.11,.12,.30),2,.045)
  # Wiper arms lie on the glass.
  rail([(s*.64,fy(3.03)-.018,3.03),(s*.82,fy(3.52)-.018,3.52)],2,.014)
  rail([(s*.49,fy(3.52)-.018,3.52),(s*1.03,fy(3.52)-.018,3.52)],2,.012)
 part(prefix+'_lights')
 for x in [-1.12,1.12]:
  box((x,a-.022,2.48),(.46,.055,.20),2,.065)
  for dx in [-.11,.11]:cyl((x+dx,a-.054,2.48),(x+dx,a-.075,2.48),.058,8,16)
 box((0,a+.62,3.97),(.44,.06,.10),8,.04)
 part(prefix+'_roof_services');box((0,y+.38,4.32),(1.18,.75,.20),1,.08)
 for x in [-.6,.6]:cyl((x,y+.25,4.23),(x,y-.05,4.23),.065,4,16)
 cyl((.98,y+.2,4.2),(.98,y+.2,4.62),.014,2,8)
def fan(x,y,z,r=.52):
 cyl((x,y,z-.035),(x,y,z+.025),r,2,40)
 for rr in [.15,.30,.46]:
  rail([(x+rr*math.cos(t),y+rr*math.sin(t),z+.035) for t in np.linspace(0,2*math.pi,41)],4,.012)
 for t in np.linspace(0,math.pi,12,endpoint=False):g.beam((x-r*math.cos(t),y-r*math.sin(t),z+.045),(x+r*math.cos(t),y+r*math.sin(t),z+.045),.018,.018,3)
def hood(a,b,paint=0):
 part('engine_hood');rounded_loft([(1.58,2.30,a,b,.14),(3.22,2.30,a,b,.16),(3.47,2.05,a+.18,b-.18,.22)],paint)
 part('hood_panels')
 for s in [-1,1]:
  for y in np.arange(a+.42,b-.25,.78):
   box((s*1.156,y,2.49),(.018,.68,1.33),paint,.012)
   box((s*1.17,y-.19,2.5),(.025,.055,.16),4,.014)
   for z in np.linspace(2.75,3.02,5):box((s*1.18,y,z),(.018,.51,.018),10)
   for zz in [1.95,3.08]:cyl((s*1.17,y+.27,zz),(s*1.19,y+.27,zz),.018,4,6)
  # Large recessed radiator with individual vertical slats.
  yy=a+1.4;box((s*1.17,yy,2.42),(.04,1.55,1.20),10,.04)
  for dy in np.linspace(-.70,.70,24):box((s*1.198,yy+dy,2.42),(.026,.020,1.10),3)
 part('roof_fans')
 for yy in [a+1.3,a+2.8]:
  if yy<b-.7:fan(0,yy,3.49,.62)
 part('exhaust');box((0,b-1.0,3.58),(.50,.65,.30),2,.08)
 cyl((0,b-1.0,3.60),(0,b-1.0,4.02),.12,3,20)
def locomotive(kind,L):
 industrial=kind=='industrial';paint=11 if industrial else 0
 chassis(L,[-L*.29,L*.29],2 if industrial else 3,loco=True)
 part('walkway_deck');box((0,0,1.58),(3.08,L-.35,.20),2,.075)
 for s in [-1,1]:box((s*1.55,0,1.61),(.035,L-.55,.085),7,.015)
 # Six axle: cabin close to one end. Industrial: central cabin.
 cy=1.0 if industrial else 3.25
 hood(-L/2+.55,cy-1.3,paint);hood(cy+1.3,L/2-.55,paint)
 cab(cy,2.65,paint=paint)
 handrails(L);steps(L)
 part('fuel_tank');box((0,0,1.02),(1.78,L*.22,.55),3,.16)
 part('end_lights')
 for yy in [-L/2+.2,L/2-.2]:
  for xx in [-.98,.98]:box((xx,yy,1.86),(.26,.045,.13),9,.03)
def mainline(L):
 # Build two mirrored independent sections, keeping moving parts separately named.
 section=18.0
 for k in range(2):
  before=set(g.parts)
  chassis(section,[-5.25,5.25],3,loco=True)
  part('body');rounded_loft([(1.48,3.12,-5.55,8.32,.24),(3.51,3.12,-5.55,8.32,.25),(3.96,2.70,-5.30,8.12,.29)],12)
  cab(-6.9,3.0,paint=12)
  part('side_panels')
  for s in [-1,1]:
   box((s*1.568,1.3,2.16),(.025,12.2,.29),1,.02)
   for y in [-3.5,-1.8,.0,1.8,3.6,5.4,7.1]:
    box((s*1.578,y,3.08),(.025,1.38,.98),10,.04)
    for dz in np.linspace(-.41,.41,12):box((s*1.60,y,3.08+dz),(.026,1.28,.023),3)
    box((s*1.585,y,2.53),(.03,.07,.14),4,.015)
  part('roof_services')
  for yy in [-1.9,.0,2.0,4.0,6.0]:fan(0,yy,3.99,.72)
  box((0,-3.5,4.08),(.60,1.05,.28),2,.08)
  for s in [-1,1]:
   for j in range(4):box((s*1.55,-6.2,.65+j*.25),(.29,.65,.055),4,.01)
   rail([(s*1.55,-6.6,1.35),(s*1.55,-6.6,2.75)],4,.027)
  part('fuel_tank');box((0,0,1.04),(2.0,5.0,.55),3,.14)
  # Each section's native parts become uniquely addressable nodes.
  keys=[key for key in g.parts if key not in before]
  # Since names would otherwise collide with first section, section0 is renamed now.
  for key in keys:
   v,f=g.parts.pop(key);v=np.asarray(v);v[:,1]=(-1 if k else 1)*v[:,1]+(-9 if k==0 else 9)
   if k:v[:,0]*=-1
   g.parts[(f'section_{k}_'+key[0],key[1])]=(v.tolist(),f)
 part('inter_section_bellows');box((0,0,2.59),(1.3,.40,2.0),6,.10)
 for yy in np.linspace(-.2,.2,7):box((0,yy,2.59),(1.45,.025,2.1),2,.03)
def ladder(y,zmax=3.4,x=1.55):
 part('access_ladders')
 for dy in [-.25,.25]:rail([(x,y+dy,.65),(x,y+dy,zmax),(x-.15,y+dy,zmax+.17)],4,.024)
 for z in np.arange(.78,zmax,.28):cyl((x,y-.25,z),(x,y+.25,z),.021,4,10)
def wagon_end(L,top):
 part('end_equipment')
 y=L/2-.1
 # Brake wheel lies in XZ plane.
 rail([(.65+.21*math.cos(t),y+.15,1.85+.21*math.sin(t)) for t in np.linspace(0,2*math.pi,25)],7,.022)
 for t in np.linspace(0,2*math.pi,5,endpoint=False):rail([(.65,y+.15,1.85),(.65+.20*math.cos(t),y+.15,1.85+.20*math.sin(t))],7,.014)
 ladder(L/2-.45,top)
def wagon(kind,L):
 bc=9.7 if kind=='container' else L*.33
 chassis(L,[-bc,bc]);part('deck')
 box((0,0,1.49),(3.02,L-.35,.18),13 if kind=='gondola' else 2,.035)
 if kind=='container':container_platform(L)
 elif kind=='gondola':gondola(L)
 elif kind=='hopper':hopper(L)
 elif kind=='tank':tank(L)
 elif kind=='covered':covered(L)
 elif kind=='pipes':pipes(L)
 wagon_end(L,2.0 if kind in ['container','pipes'] else 3.7)
def container_platform(L):
 part('platform_frame')
 for x in [-1.48,1.48]:box((x,0,1.43),(.12,L-.35,.35),11,.025)
 for yy in [-12.20,-.06,.06,12.20]:
  for x in [-1.20,1.20]:box((x,yy,1.65),(.16,.18,.13),7,.02)
 # Cargo on separate nodes, corrugated sides and roofs with door bars.
 for k,y in enumerate([-6.14,6.14]):
  part(f'cargo_container_{k}');m=1 if k==0 else 11
  box((0,y,3.02),(2.438,12.192,2.59),m,.045)
  for s in [-1,1]:
   for yy in np.arange(y-5.94,y+6,.205):box((s*1.229,yy,3.02),(.045,.053,2.37),m,.014)
   for z in [1.77,4.27]:box((s*1.23,y,z),(.07,12.13,.09),m,.018)
  for yy in np.arange(y-5.94,y+6,.25):box((0,yy,4.327),(2.29,.045,.022),m,.01)
  for e in [-1,1]:
   ye=y+e*6.105
   for x in [-.87,-.34,.34,.87]:cyl((x,ye,1.95),(x,ye,4.05),.022,4,10)
   for x in [-1.16,1.16]:
    for z in [1.82,4.20]:box((x,ye,z),(.14,.075,.13),3,.02)
   for x in [-.58,.58]:box((x,ye+e*.018,2.56),(.68,.02,.32),2,.01)
def gondola(L):
 part('gondola_body')
 for s in [-1,1]:
  box((s*1.48,0,2.55),(.10,L-.55,2.10),13,.025)
  box((s*1.48,0,3.65),(.17,L-.45,.14),13,.045)
  for yy in np.linspace(-L/2+.35,L/2-.35,14):box((s*1.56,yy,2.53),(.13,.11,2.08),13,.025)
 for yy in [-L/2+.27,L/2-.27]:
  box((0,yy,2.57),(2.98,.11,2.10),13,.025)
  for x in np.linspace(-1.3,1.3,5):box((x,yy,2.58),(.09,.16,1.95),13,.02)
 part('cargo_coal');rng=np.random.default_rng(39);nx,ny=14,55;v=[]
 for j,yy in enumerate(np.linspace(-L/2+.40,L/2-.40,ny)):
  for i,xx in enumerate(np.linspace(-1.38,1.38,nx)):
   z=3.25+.27*math.sin(math.pi*i/(nx-1))+.07*rng.random();v.append((xx,yy,z))
 f=[]
 for j in range(ny-1):
  for i in range(nx-1):a=j*nx+i;f.extend([[a,a+1,a+nx+1],[a,a+nx+1,a+nx]])
 g.add(v,f,17)
def hopper(L):
 part('hopper_body');rounded_loft([(2.05,2.18,-L/2+.9,L/2-.9,.10),(2.75,3.10,-L/2+.40,L/2-.40,.12),(4.04,3.10,-L/2+.40,L/2-.40,.12),(4.34,2.65,-L/2+.60,L/2-.60,.16)],14)
 for s in [-1,1]:
  for yy in np.linspace(-L/2+.6,L/2-.6,13):box((s*1.573,yy,3.37),(.075,.085,1.30),14,.02)
 part('hopper_discharge')
 for yy in [-4.1,0,4.1]:
  rounded_loft([(.88,.88,yy-.62,yy+.62,.07),(2.10,2.18,yy-1.80,yy+1.80,.06)],14)
  box((0,yy,.85),(.96,1.40,.12),3,.03)
  cyl((-.64,yy,.91),(.64,yy,.91),.035,4,12)
 part('roof_hatches')
 for yy in np.linspace(-5.8,5.8,7):
  cyl((0,yy,4.30),(0,yy,4.40),.43,3,32);cyl((0,yy,4.40),(0,yy,4.46),.40,14,32)
  rail([(-.16,yy,4.47),(-.16,yy,4.53),(.16,yy,4.53),(.16,yy,4.47)],4,.018)
 for x in [-.70,.70]:
  box((x,0,4.37),(.30,L-1.5,.045),3,.01)
  for yy in np.arange(-L/2+.8,L/2-.8,1.2):cyl((x,yy,4.37),(x,yy,4.92),.018,4,8)
  rail([(x,-L/2+.8,4.92),(x,L/2-.8,4.92)],4,.02)
def tank(L):
 part('tank_vessel');a=L/2-1.3
 prof=[(-a-.52,.12),(-a-.48,.53),(-a-.35,1.02),(-a-.14,1.31),(-a,1.40),(a,1.40),(a+.14,1.31),(a+.35,1.02),(a+.48,.53),(a+.52,.12)]
 lathe_y((0,2.88),prof,15,64)
 part('tank_bands')
 for yy in [-a,-a*.54,a*.54,a]:
  rail([(1.405*math.cos(t),yy,2.88+1.405*math.sin(t)) for t in np.linspace(0,2*math.pi,65)],3,.027)
 for yy in [-3.65,3.65]:
  box((0,yy,1.65),(2.25,.65,.33),3,.055)
  for s in [-1,1]:g.beam((s*.9,yy,1.65),(s*1.25,yy,2.18),.19,.35,3)
 part('tank_dome');cyl((0,0,4.20),(0,0,4.62),.43,15,36);cyl((0,0,4.62),(0,0,4.69),.48,3,36)
 for t in np.linspace(0,2*math.pi,10,endpoint=False):cyl((.42*math.cos(t),.42*math.sin(t),4.69),(.42*math.cos(t),.42*math.sin(t),4.73),.025,4,6)
 for x in [-.67,.67]:
  box((x,0,4.35),(.29,3.2,.06),3,.01)
  rail([(x,-1.65,4.35),(x,-1.65,4.95),(x,1.65,4.95),(x,1.65,4.35)],7,.024)
  for yy in [-.55,.55]:cyl((x,yy,4.35),(x,yy,4.95),.021,7,10)
 ladder(0,4.35,1.48)
 part('tank_valves');cyl((0,0,1.4),(0,0,.83),.09,3,16)
 for s in [-1,1]:box((s*1.414,0,2.88),(.01,2.7,.32),11,.004)
def covered(L):
 part('covered_body');rounded_loft([(1.53,3.10,-L/2+.3,L/2-.3,.06),(3.95,3.10,-L/2+.3,L/2-.3,.06),(4.25,2.95,-L/2+.3,L/2-.3,.09),(4.47,1.8,-L/2+.3,L/2-.3,.10),(4.50,.18,-L/2+.3,L/2-.3,.02)],11)
 part('corrugation')
 for s in [-1,1]:
  for yy in np.arange(-L/2+.45,L/2-.3,.25):
   if abs(yy)>1.65:box((s*1.57,yy,2.77),(.035,.055,2.12),11,.014)
  box((s*1.60,0,2.80),(.065,3.16,2.37),11,.04)
  for yy in np.arange(-1.43,1.5,.22):box((s*1.65,yy,2.80),(.025,.045,2.18),11,.01)
  for z in [1.61,4.0]:box((s*1.65,0,z),(.11,6.4,.09),3,.02)
  rail([(s*1.73,-1.18,2.16),(s*1.73,-1.18,3.22)],4,.029)
  for z in [2.2,3.2]:box((s*1.70,-1.18,z),(.09,.19,.09),3,.018)
 for yy in [-L/2+.28,L/2-.28]:
  for x in [-1,-.5,0,.5,1]:box((x,yy,2.82),(.075,.08,2.36),11,.018)
def hollow_pipe(x,y,z,L,r):
 # Annular ends and inner bore: these really are hollow tubes.
 n=32;v=[]
 for yy,rr in [(-L/2,r),(L/2,r),(-L/2,r-.035),(L/2,r-.035)]:v.extend([(x+rr*math.cos(t),y+yy,z+rr*math.sin(t)) for t in np.linspace(0,2*math.pi,n,endpoint=False)])
 f=[]
 for i in range(n):
  j=(i+1)%n
  for a,b,reverse in [(0,1,True),(2,3,False),(0,2,False),(1,3,True)]:
   t=[[a*n+i,b*n+j,a*n+j],[a*n+i,b*n+i,b*n+j]]
   if reverse:t=[q[::-1] for q in t]
   f.extend(t)
 # Repair each surface's expected winding analytically.
 va=np.array(v)
 for t in f:
  mid=va[t].mean(0);cr=np.cross(va[t[1]]-va[t[0]],va[t[2]]-va[t[0]])
  if abs(mid[1]-(y-L/2))<1e-5:expected=np.array([0,-1,0])
  elif abs(mid[1]-(y+L/2))<1e-5:expected=np.array([0,1,0])
  else:
   expected=np.array([mid[0]-x,0,mid[2]-z]);rad=np.linalg.norm(expected)
   if rad<r-.02:expected*=-1
  if np.dot(cr,expected)<0:t[1],t[2]=t[2],t[1]
 g.add(v,f,3)
def pipes(L):
 part('timber_deck')
 for yy in np.arange(-L/2+.3,L/2-.3,.23):box((0,yy,1.61),(2.87,.21,.06),16,.008)
 part('stanchions')
 for yy in [-5.6,-2.0,2.,5.6]:
  box((0,yy,1.72),(2.85,.23,.17),16,.025)
  for s in [-1,1]:box((s*1.48,yy,2.30),(.10,.10,1.4),13,.025)
 part('cargo_pipes')
 for row,num in enumerate([5,4,3]):
  for j in range(num):hollow_pipe((j-(num-1)/2)*.51,0,2.0+row*.445,12.1,.25)
 part('cargo_straps')
 for yy in [-4.9,-.9,3.9]:rail([(-1.35,yy,1.72),(-1.32,yy,2.12),(-.81,yy,2.57),(-.55,yy,3.12),(.55,yy,3.12),(.81,yy,2.57),(1.32,yy,2.12),(1.35,yy,1.72)],6,.038)
def export(kind):
 title,L,typ=CFG[kind];doc={'asset':{'version':'2.0','generator':'Афина — original railway visual assets'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[]};data=bytearray()
 def view(raw,target=None):
  data.extend(b'\0'*((-len(data))%4));v={'buffer':0,'byteOffset':len(data),'byteLength':len(raw)}
  if target:v['target']=target
  data.extend(raw);doc['bufferViews'].append(v);return len(doc['bufferViews'])-1
 def acc(a,typ,ct=5126,target=34962):
  a=np.asarray(a,dtype='<f4' if ct==5126 else '<u4');v=view(a.tobytes(),target);o={'bufferView':v,'componentType':ct,'count':len(a),'type':typ}
  if typ=='VEC3':o.update(min=a.min(0).tolist(),max=a.max(0).tolist())
  doc['accessors'].append(o);return len(doc['accessors'])-1
 for i,(name,c,metal,rough) in enumerate(M):
  mat={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*c,1],'metallicFactor':metal,'roughnessFactor':rough}}
  if i==8:mat['emissiveFactor']=[.6,.8,1.]
  doc['materials'].append(mat)
 triangles=vertices=0
 for name in dict.fromkeys(k[0] for k in g.parts):
  pp=[]
  for (partname,mat),(v,f) in g.parts.items():
   if name!=partname:continue
   v=np.array(v,float);f=np.array(f,int);pts=v[f];cr=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);length=np.linalg.norm(cr,axis=1);ok=length>1e-10;f=f[ok];pts=v[f];cr=cr[ok];length=length[ok]
   n=g.smooth_normals(v,f).reshape(-1,3,3);bad=np.sum(cr*n.mean(1),axis=1)<=0;n[bad]=cr[bad,None,:]/length[bad,None,None]
   p=pts.reshape(-1,3)[:,[0,2,1]].copy();p[:,2]*=-1;n=n.reshape(-1,3)[:,[0,2,1]].copy();n[:,2]*=-1
   a,idx=np.unique(np.c_[p,n].astype('<f4'),axis=0,return_inverse=True);vertices+=len(a);triangles+=len(idx)//3
   pp.append({'attributes':{'POSITION':acc(a[:,:3],'VEC3'),'NORMAL':acc(a[:,3:],'VEC3')},'indices':acc(idx,'SCALAR',5125,34963),'material':mat,'mode':4})
  mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':pp});ni=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mi});doc['scenes'][0]['nodes'].append(ni)
 couplerPitch=L+.72
 allv=np.concatenate([np.asarray(v) for v,f in g.parts.values()]);dim=(allv.max(0)-allv.min(0))[[0,2,1]].tolist()
 doc['extras']={'project':'Афина','title':title,'units':'metres','up':'Y','forward':'+Z','trackGaugeMetres':1.520,'designStatus':'original visual concept; not factory CAD','couplers':{'front':[0,1.03,L/2+.36],'rear':[0,1.03,-L/2-.36]},'couplerPitchMetres':couplerPitch,'wheelRadiusMetres':.50 if typ in ['shunter','industrial','mainline'] else .46,'wheelAxis':'+X','notes':'All mesh geometry uses vehicle-origin coordinates. Set wheel pivots at each mesh bounding-box centre before rotation. No animation clips.'}
 doc['buffers']=[{'byteLength':len(data)}];js=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4);size=28+len(js)+len(data)
 (P/(kind+'.glb')).write_bytes(struct.pack('<III',0x46546c67,2,size)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
 result={'file':kind+'.glb','title':title,'triangles':triangles,'vertices':vertices,'nodes':len(doc['nodes']),'bytes':size,'dimensions_xyz_m':dim,'coupler_pitch_m':couplerPitch};print(result,flush=True);ANCHORS[kind]=doc['extras'];return result
if __name__=='__main__':
 stats=[]
 for kind,(title,L,typ) in CFG.items():
  g.parts={};g.decals=[]
  if typ in ['shunter','industrial']:locomotive(typ,L)
  elif typ=='mainline':mainline(L)
  else:wagon(typ,L)
  stats.append(export(kind))
 (P/'model_statistics.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
 (P/'connection_points.json').write_text(json.dumps(ANCHORS,ensure_ascii=False,indent=2))
