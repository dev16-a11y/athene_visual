"""Actual GLB renders in a contact sheet, no synthetic imagery."""
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).resolve().parent
spec=json.loads((P/'connection_points.json').read_text());W,H=720,480
out=Image.new('RGB',(W*3,H*3+116),'#e9eff2');d=ImageDraw.Draw(out);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
d.text((38,19),'АФИНА  /  ЖЕЛЕЗНОДОРОЖНАЯ ТЕХНИКА',font=ImageFont.truetype(font,34),fill='#173e50')
d.text((40,68),'3 локомотива · 6 типов вагонов · рендеры экспортированных GLB',font=ImageFont.truetype(font,21),fill='#4c6876')
for i,(kind,meta) in enumerate(spec.items()):
 im=Image.open(P/(kind+'_studio.png')).convert('RGB');im=im.resize((W,H),Image.Resampling.LANCZOS);out.paste(im,((i%3)*W,116+(i//3)*H))
out.save(P/'railway_gallery.jpg',quality=94)
print(P/'railway_gallery.jpg')
