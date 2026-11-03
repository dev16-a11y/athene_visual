"""Container-line atlases; logos from DCSA member graphic, see SOURCES.md.
Side, door and roof occupy separate regions: no mirrored or stretched wordmarks.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import numpy as np
import io,json
P=Path(__file__).resolve().parent
LINES=[
 {'key':'zim','name':'ZIM','rgb':(138,48,40),'ink':(242,243,234),'mono':True,'prefix':'ZIMU'},
 {'key':'maersk','name':'Maersk','rgb':(175,187,191),'ink':(28,39,45),'mono':False,'prefix':'MSKU'},
 {'key':'hapag_lloyd','name':'Hapag-Lloyd','rgb':(225,111,26),'ink':(24,33,62),'mono':False,'prefix':'HLXU'},
 {'key':'msc','name':'MSC','rgb':(195,156,61),'ink':(31,34,31),'mono':True,'prefix':'MSCU'},
 {'key':'cma_cgm','name':'CMA CGM','rgb':(27,54,77),'ink':(239,242,235),'mono':True,'prefix':'CMAU'},
]
BY_BAY=[0,0,1,1,2,3,3,4,4]
def line_index(bay):return BY_BAY[bay]
def fitted_logo(i,size):
 cfg=LINES[i];im=Image.open(P/'branding'/(cfg['key']+'.png')).convert('RGBA')
 if cfg['mono']:
  alpha=im.getchannel('A');im=Image.new('RGBA',im.size,cfg['ink']+(0,));im.putalpha(alpha)
 im.thumbnail(size,Image.Resampling.LANCZOS);return im

def atlas(i):
 cfg=LINES[i];W,H=2048,1024;rgb=np.array(cfg['rgb'],float);rng=np.random.default_rng(100+i)
 arr=np.tile(rgb,(H,W,1))
 for x0,y0,w,h,ribs in [(0,0,2048,512,44),(0,512,512,512,12),(512,512,1536,512,24)]:
  u=np.arange(w)/w;shade=1+.025*np.sin(u*2*np.pi*ribs)+.009*np.sin(u*4*np.pi*ribs)
  arr[y0:y0+h,x0:x0+w,:]*=shade[None,:,None]
  # restrained, clean painted-metal texture; roofs carry no billboard logos.
  arr[y0:y0+h,x0:x0+w,:]+=rng.integers(-1,2,(h,w,1))
 im=Image.fromarray(np.clip(arr,0,255).astype(np.uint8)).convert('RGBA');d=ImageDraw.Draw(im)
 ink=cfg['ink'];shadow=tuple(max(0,int(x*.67)) for x in cfg['rgb']);highlight=tuple(min(255,int(x*1.12)) for x in cfg['rgb'])
 # Perimeter rails, corner castings, centre door seam and locking hardware.
 d.rectangle((6,8,2041,504),outline=shadow,width=9);d.line((15,18,2032,18),fill=highlight,width=5)
 for x in [8,2010]:
  for y in [8,470]:d.rectangle((x,y,x+28,y+32),fill=shadow);d.rectangle((x+7,y+7,x+21,y+25),fill=(53,60,57))
 door=(0,512,512,1024);d.rectangle((8,522,504,1016),outline=shadow,width=10);d.line((256,527,256,1010),fill=shadow,width=5)
 for x in [76,196,316,436]:
  d.line((x,560,x,982),fill=(171,178,174),width=5)
  for y in [610,760,936]:d.rectangle((x-6,y-4,x+8,y+8),fill=(91,103,103))
 # Original logo shapes, recolored only where a monochrome paint mark is used.
 size=(1160,310) if i in [1,2] else ((810,350) if i==4 else (530,350))
 logo=fitted_logo(i,size);im.alpha_composite(logo,((2048-logo.width)//2,(512-logo.height)//2-8))
 logo=fitted_logo(i,(300,190));im.alpha_composite(logo,((512-logo.width)//2,545))
 d=ImageDraw.Draw(im);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';small=ImageFont.truetype(font,20);tiny=ImageFont.truetype(font,17)
 d.text((84,438),cfg['prefix']+'  DEMO   /   40 FT',font=small,fill=ink)
 d.text((1770,50),'42G1',font=small,fill=ink)
 d.text((31,825),cfg['prefix']+'  DEMO',font=tiny,fill=ink)
 d.text((31,856),'40 FT  /  DRY',font=tiny,fill=ink)
 d.text((31,930),'SMARTTWIN VISUAL ASSET',font=ImageFont.truetype(font,13),fill=ink)
 # Apply only mild rib modulation to the paint logo to seat it on corrugation.
 out=np.array(im.convert('RGB'),float);u=np.arange(2048)/2048;shade=1+.010*np.sin(u*2*np.pi*44);out[:512]*=shade[None,:,None]
 return Image.fromarray(np.clip(out,0,255).astype(np.uint8))

def normal_atlas():
 a=np.empty((1024,2048,3),np.uint8);a[:]=[128,128,255]
 for x0,y0,w,h,ribs in [(0,0,2048,512,44),(0,512,512,512,12),(512,512,1536,512,24)]:
  u=np.arange(w)/w;g=1.25*np.sin(u*2*np.pi*ribs);n=np.stack([-g,np.zeros(w),np.ones(w)],axis=1);n/=np.linalg.norm(n,axis=1)[:,None];a[y0:y0+h,x0:x0+w]=np.tile(((n+1)*127.5).astype(np.uint8)[None,:,:],(h,1,1))
  a[y0:y0+10,x0:x0+w]=[128,128,255];a[y0+h-10:y0+h,x0:x0+w]=[128,128,255]
 return Image.fromarray(a)

def png(im):
 out=io.BytesIO();im.save(out,format='PNG',optimize=True);return out.getvalue()
def create_files():
 dest=P/'textures';dest.mkdir(exist_ok=True)
 sheets=[]
 for i,cfg in enumerate(LINES):
  im=atlas(i);im.save(dest/(cfg['key']+'_atlas.png'));panel=im.crop((0,0,2048,512));sheets.append(panel)
 normal_atlas().save(dest/'corrugation_normal.png')
 preview=Image.new('RGB',(2048,5*512))
 for i,im in enumerate(sheets):preview.paste(im,(0,i*512))
 preview.save(P/'container_lines_preview.png')
if __name__=='__main__':create_files()
