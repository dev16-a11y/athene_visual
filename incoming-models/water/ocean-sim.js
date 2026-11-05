// Native Babylon.js adapter of Ultra-Water's JONSWAP / Stockham FFT passes.
// Upstream shader copyright (c) 2026 Humpalumps, MIT; notices shipped alongside.
import {N, LOG_N, CASCADE_LENGTHS, INIT_FRAG, EVOLVE_FRAG, FFT_FRAG, ASSEMBLE_FRAG, jonswapParams, defaultOceanParams} from './ocean-shaders.js';
const B=window.BABYLON;
function adapt(source) {
 // Babylon's WebGL2 processor preserves explicit layout outputs. Avoid
 // gl_FragData: explicit MRT locations are required by this adapter.
 return source.replace('out vec4 outColor;', 'layout(location = 0) out vec4 outColor;');
}
export class BabylonOceanSim {
 constructor(scene) {
  this.scene=scene;this.engine=scene.getEngine();this.params={...defaultOceanParams(),windSpeed:5.8,waveScale:.38,swellScale:.24,fetchKm:35,choppiness:.7};this.time=0;this.dirty=true;this.parity=0;this.initialized=false;
  if(this.engine.webGLVersion<2 || !this.engine.getCaps().textureFloatRender || !this.engine.getCaps().textureHalfFloatRender)throw Error('Для FFT-воды нужны WebGL2 и плавающие render targets.');
  this.renderer=new B.EffectRenderer(this.engine);
  const target=(name,w,h,count,type,linear=false)=>{
   const rt=new B.MultiRenderTarget(name,{width:w,height:h},count,scene,{types:Array(count).fill(type),samplingModes:Array(count).fill(linear?B.Texture.BILINEAR_SAMPLINGMODE:B.Texture.NEAREST_SAMPLINGMODE),generateMipMaps:false,generateDepthBuffer:false,generateStencilBuffer:false,drawOnlyOnFirstAttachmentByDefault:false});
   for(const t of rt.textures){t.wrapU=t.wrapV=B.Texture.WRAP_ADDRESSMODE;t.gammaSpace=false;}
   return rt;
  };
  this.h0=target('spectrum',N,N*4,1,B.Constants.TEXTURETYPE_FLOAT);
  this.ping=target('fft_ping',N,N*4,2,B.Constants.TEXTURETYPE_HALF_FLOAT);this.pong=target('fft_pong',N,N*4,2,B.Constants.TEXTURETYPE_HALF_FLOAT);
  this.out=CASCADE_LENGTHS.map((_,i)=>[0,1].map(j=>target(`ocean_${i}_${j}`,N,N,2,B.Constants.TEXTURETYPE_HALF_FLOAT,true)));
  const pass=(name,source,uniforms,samplers)=>new B.EffectWrapper({engine:this.engine,name,fragmentShader:adapt(source),vertexShader:'attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}',attributeNames:['position'],uniformNames:uniforms,samplerNames:samplers,useShaderStore:false});
  this.init=pass('spectrum_init',INIT_FRAG,['uSpecA','uSpecB','uLength','uCut','uCapFade','uSeed'],[]);
  this.evolve=pass('spectrum_evolve',EVOLVE_FRAG,['uLength','uTime'],['uH0']);
  this.fft=pass('stockham_ifft',FFT_FRAG,['uSub','uVertical'],['uIn0','uIn1']);
  this.assemble=pass('assemble_ocean',ASSEMBLE_FRAG,['uCascade','uLambda','uDt','uFoamRecovery'],['uIn0','uIn1','uPrev']);
  this.passes=[this.init,this.evolve,this.fft,this.assemble];this.displacement=this.out.map(p=>p[0].textures[0]);this.slope=this.out.map(p=>p[0].textures[1]);this.lengths=CASCADE_LENGTHS;
 }
 draw(pass,target,bind){pass.onApplyObservable.clear();pass.onApplyObservable.add(()=>bind(pass.effect));this.renderer.render(pass,target);}
 update(dt){
  if(!this.passes.every(p=>p.effect?.isReady()))return false;
  if(!this.initialized){for(const pair of this.out)for(const rt of pair){this.engine.bindFramebuffer(rt.renderTarget);this.engine.clear(new B.Color4(0,0,0,1),true,false,false);this.engine.unBindFramebuffer(rt.renderTarget);}this.initialized=true;}
  const p=this.params;
  if(this.dirty){
   const wind=jonswapParams(p.windSpeed,p.fetchKm),swell=jonswapParams(p.swellWindSpeed,p.swellFetchKm),rad=Math.PI/180;
   this.draw(this.init,this.h0,e=>{e.setArray4('uSpecA',[p.waveScale,p.windDirection*rad,p.spreadBlend,p.windSwell,p.swellScale*p.waveScale,p.swellDirection*rad,1,p.swellSwell]);e.setArray4('uSpecB',[wind.alpha,wind.peakOmega,p.gamma,p.shortWavesFade,swell.alpha,swell.peakOmega,p.gamma,p.shortWavesFade]);e.setFloat4('uLength',...CASCADE_LENGTHS);e.setFloat4('uCut',...CASCADE_LENGTHS.slice(1).map(L=>2*Math.PI/L*6),0);e.setFloat('uCapFade',p.capillaryFade);e.setUInt('uSeed',1337);});this.dirty=false;
  }
  dt=Math.min(dt,.05)*p.timeScale;this.time=(this.time+dt)%300;
  this.draw(this.evolve,this.ping,e=>{e.setTexture('uH0',this.h0.textures[0]);e.setFloat4('uLength',...CASCADE_LENGTHS);e.setFloat('uTime',this.time);});
  let src=this.ping,dst=this.pong;
  for(let dir=0;dir<2;dir++)for(let s=1;s<=LOG_N;s++){
   const input=src;this.draw(this.fft,dst,e=>{e.setInt('uSub',1<<s);e.setInt('uVertical',dir);e.setTexture('uIn0',input.textures[0]);e.setTexture('uIn1',input.textures[1]);});[src,dst]=[dst,src];
  }
  const next=this.parity^1;
  for(let c=0;c<4;c++){
   this.draw(this.assemble,this.out[c][next],e=>{e.setTexture('uIn0',src.textures[0]);e.setTexture('uIn1',src.textures[1]);e.setTexture('uPrev',this.out[c][this.parity].textures[0]);e.setInt('uCascade',c);e.setFloat('uLambda',p.choppiness);e.setFloat('uDt',dt);e.setFloat('uFoamRecovery',p.foamRecovery);});
   this.displacement[c]=this.out[c][next].textures[0];this.slope[c]=this.out[c][next].textures[1];
  }
  this.parity=next;this.engine.restoreDefaultFramebuffer();return true;
 }
 dispose(){for(const p of this.passes)p.dispose();for(const r of [this.h0,this.ping,this.pong,...this.out.flat()])r.dispose();this.renderer.dispose();}
}
