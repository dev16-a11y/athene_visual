// Prototype surface shader: native Babylon.js, analytic sky + planar reflections.
// FFT textures originate from the adapted MIT-licensed Ultra-Water simulation.
const B=window.BABYLON;
const vertex=`precision highp float;
attribute vec3 position;
uniform mat4 world,viewProjection;
uniform sampler2D disp0,disp1,disp2,disp3;
uniform vec3 cameraPosition;
uniform float waveGain;
varying vec3 vWorld;varying vec4 vClip;varying vec2 vBase;varying float vFoam;
void main(){
 vec3 p=(world*vec4(position,1.)).xyz;vBase=p.xz;
 vec4 a=texture2D(disp0,p.xz/600.),b=texture2D(disp1,p.xz/85.),c=texture2D(disp2,p.xz/12.);
 float shelter=1.-.48*exp(-pow((p.x-64.)/45.,2.));
 p+=(a.xyz+b.xyz+c.xyz)*waveGain*shelter;
 vFoam=min(a.w,min(b.w,c.w));vWorld=p;vClip=viewProjection*vec4(p,1.);gl_Position=vClip;
}`;
const fragment=`precision highp float;
uniform sampler2D slope0,slope1,slope2,slope3,reflectionSampler;
uniform vec3 cameraPosition,sunDirection,sunColor,deepColor;
uniform float time,wind,reflectionOn,foamOn,sunset,foamThreshold;
varying vec3 vWorld;varying vec4 vClip;varying vec2 vBase;varying float vFoam;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 sky(vec3 r){
 float h=pow(clamp(r.y,0.,1.),.38);
 vec3 horizon=mix(vec3(.67,.79,.83),vec3(.92,.63,.39),sunset);
 vec3 zenith=mix(vec3(.13,.37,.57),vec3(.19,.28,.43),sunset);
 vec3 col=mix(horizon,zenith,h);
 float cloud=noise(r.xz/max(r.y+.15,.14)*3.+time*.001);cloud=mix(cloud,noise(r.xz/max(r.y+.2,.14)*7.),.3);
 col=mix(col,vec3(.89,.91,.89),smoothstep(.59,.82,cloud)*smoothstep(.03,.30,r.y)*.5);
 col+=sunColor*pow(max(dot(r,sunDirection),0.),600.)*2.;return col;
}
void main(){
 vec2 q=vBase;
 vec2 s=texture2D(slope0,q/600.).xy+texture2D(slope1,q/85.).xy+texture2D(slope2,q/12.).xy;
 float dist=length(cameraPosition-vWorld);float fine=1.-smoothstep(40.,260.,dist);
 s+=texture2D(slope3,q/2.1).xy*fine*.35; s*=.24;
 // Sub-pixel ripples retain visual richness when the basin is sheltered.
 s+=vec2(sin(q.x*2.1+sin(q.y*.7)+time*1.1),cos(q.y*2.7+sin(q.x*.8)-time*.9))*.011*(.5+wind*.08);
 vec3 n=normalize(vec3(-s.x,1.,-s.y));vec3 v=normalize(cameraPosition-vWorld);if(n.y<0.)n=-n;
 vec3 r=reflect(-v,n);float nv=max(dot(n,v),.001);float fresnel=.0204+.9796*pow(1.-nv,5.);
 vec3 reflected=sky(r);
 vec2 uv=vClip.xy/vClip.w*.5+.5;vec2 distortion=n.xz*.018*clamp(70./max(dist,1.),.3,1.3);
 vec2 ruv=uv+distortion;
 if(reflectionOn>.5&&min(ruv.x,ruv.y)>.005&&max(ruv.x,ruv.y)<.995){vec3 rr=texture2D(reflectionSampler,ruv).rgb;reflected=mix(reflected,rr,.90);}
 float ndl=max(dot(n,sunDirection),0.);vec3 base=deepColor*(.48+.52*ndl);
 base+=vec3(.015,.075,.067)*max(vWorld.y,0.)*.18;
 vec3 h=normalize(v+sunDirection);float nh=max(dot(n,h),0.);float rough=mix(.13,.19,clamp(wind/14.,0.,1.));float a2=pow(rough,4.);float denom=nh*nh*(a2-1.)+1.;float D=a2/(3.14159265*denom*denom);
 float spec=min(D*.025,4.)*ndl;
 vec3 color=mix(base,reflected,fresnel)+sunColor*spec;
 float lace=noise(q*4.+time*.10)*noise(q*.65-time*.04);
 float crest=(1.-smoothstep(foamThreshold-.30,foamThreshold,vFoam))*smoothstep(.13,.38,lace);
 float edge=exp(-abs(q.x-65.)*2.8)*(.4+.6*noise(q*.7+time*.12));
 float foam=clamp((crest*.64+edge*.25)*foamOn,0.,.82);color=mix(color,vec3(.75,.84,.81),foam);
 // Distance haze matches the procedural sky.
 float fog=1.-exp(-dist*.00014);color=mix(color,sky(normalize(vec3(vWorld.x-cameraPosition.x,.03,vWorld.z-cameraPosition.z))),fog);
 color=color/(color+vec3(1.));color=pow(max(color,vec3(0)),vec3(1./2.2));gl_FragColor=vec4(color,1.);
}`;
export function createWater(scene,sim,mirror){
 const material=new B.ShaderMaterial('AthenaOceanMaterial',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position'],uniforms:['world','viewProjection','cameraPosition','waveGain','time','wind','reflectionOn','foamOn','sunset','sunDirection','sunColor','deepColor','foamThreshold'],samplers:['disp0','disp1','disp2','disp3','slope0','slope1','slope2','slope3','reflectionSampler']});
 material.backFaceCulling=false;material.setTexture('reflectionSampler',mirror);
 // Polar grid: dense near the view target, coarse toward the horizon.
 const vertices=[0,0,0],indices=[],A=192,radii=[];
 for(let r=1;r<5000;r*=1.065)radii.push(r);radii.push(25000);
 for(const r of radii)for(let j=0;j<A;j++){let t=j/A*Math.PI*2;vertices.push(Math.cos(t)*r,0,Math.sin(t)*r);}
 for(let j=0;j<A;j++)indices.push(0,1+j,1+(j+1)%A);
 for(let k=0;k<radii.length-1;k++)for(let j=0;j<A;j++){let a=1+k*A+j,b=1+k*A+(j+1)%A,c=b+A,d=a+A;indices.push(a,c,b,a,d,c);}
 const mesh=new B.Mesh('water_surface',scene),data=new B.VertexData();data.positions=vertices;data.indices=indices;data.normals=new Array(vertices.length).fill(0);for(let i=1;i<data.normals.length;i+=3)data.normals[i]=1;data.applyToMesh(mesh);mesh.material=material;mesh.alwaysSelectAsActiveMesh=true;mesh.isPickable=false;
 return {mesh,material,update(camera,settings){for(let i=0;i<4;i++){material.setTexture('disp'+i,sim.displacement[i]);material.setTexture('slope'+i,sim.slope[i]);}material.setVector3('cameraPosition',camera.globalPosition);material.setFloat('time',sim.time);material.setFloat('waveGain',.24);material.setFloat('wind',settings.wind);material.setFloat('reflectionOn',settings.reflections?1:0);material.setFloat('foamOn',settings.foam?1:0);material.setFloat('sunset',settings.sunset?1:0);material.setVector3('sunDirection',settings.sunDirection);material.setColor3('sunColor',settings.sunset?new B.Color3(1.7,.95,.48):new B.Color3(1.35,1.28,1.08));material.setColor3('deepColor',new B.Color3(.012,.090,.102));material.setFloat('foamThreshold',.65);},dispose(){mesh.dispose();material.dispose();}};
}
export const skyVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDir;void main(){vDir=position;gl_Position=worldViewProjection*vec4(position,1.);}`;
export const skyFragment=`precision highp float;varying vec3 vDir;uniform vec3 sunDirection;uniform float sunset;void main(){vec3 d=normalize(vDir);float h=pow(max(d.y,0.),.45);vec3 a=mix(vec3(.68,.80,.85),vec3(.91,.64,.44),sunset);vec3 b=mix(vec3(.16,.40,.62),vec3(.20,.29,.44),sunset);vec3 c=mix(a,b,h);c+=vec3(1.,.88,.61)*pow(max(dot(d,sunDirection),0.),800.)*2.;gl_FragColor=vec4(c,1.);}`;
