import {BabylonOceanSim} from './ocean-sim.js';
import {createWater,skyVertex,skyFragment} from './water-material.js';
const B=window.BABYLON,$=id=>document.getElementById(id),canvas=$('scene');
const settings={wind:5.8,waves:.38,reflections:true,foam:true,sunset:false,paused:false,sunDirection:new B.Vector3(-.6,.65,.4).normalize()};
let engine,scene,sim,water,mirror,camera,ship,sun,skyMaterial;let ready=false,lastFPS=0,camGoal=null;
function fail(message){$('error-message').textContent=message;$('error').hidden=false;$('loading').classList.add('done');document.documentElement.dataset.state='error';}
window.addEventListener('error',e=>{if(!ready)fail(e.message||'Ошибка запуска графики.');});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);fail(String(e.reason?.message||e.reason));});
const views={port:[2.25,1.08,395,[22,3,0]],ship:[2.43,1.40,185,[-6,4,25]],water:[2.40,1.51,100,[-55,1.2,110]],aerial:[2.13,.45,530,[65,0,0]]};
function setView(name){const v=views[name];camGoal={alpha:v[0],beta:v[1],radius:v[2],target:B.Vector3.FromArray(v[3])};document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('view-description').textContent={port:'Волны, свет и отражения в единой сцене.',ship:'Отражения корпуса и движение воды у борта.',water:'Мелкая рябь, солнечные блики и горизонт.',aerial:'Рисунок волн с высоты портового обзора.'}[name];document.documentElement.dataset.view=name;}
function pbr(name,c,metal=0,rough=.65){const m=new B.PBRMaterial(name,scene);m.albedoColor=B.Color3.FromHexString(c);m.metallic=metal;m.roughness=rough;return m;}
function box(name,pos,dimensions,material){const m=B.MeshBuilder.CreateBox(name,{width:dimensions[0],height:dimensions[1],depth:dimensions[2]},scene);m.position=B.Vector3.FromArray(pos);m.material=material;return m;}
function buildPort(){
 const concrete=pbr('Светлый бетон','#9ba4a2',0,.93),edge=pbr('Борт причала','#676e6c',.05,.88),asphalt=pbr('Асфальт','#47565a',0,.96),steel=pbr('Окрашенная сталь','#245c70',.52,.4),rubber=pbr('Резиновые отбойники','#17222a',0,.94),yellow=pbr('Разметка','#d9b65e',.03,.8);
 box('quay',[147,-3,0],[164,12,640],concrete);box('quay_facing',[66,-2,0],[2,10,640],edge);box('road',[100,3.04,0],[17,.07,620],asphalt);
 for(let z=-300;z<310;z+=12)box('road_marking',[100,3.085,z],[.20,.02,5],yellow);
 for(let z=-295;z<300;z+=14){box('quay_safety_mark',[67.3,3.05,z],[1.1,.08,5],yellow);box('fender',[64.0,.45,z],[1.7,3.7,1.5],rubber);const bollard=B.MeshBuilder.CreateCylinder('bollard',{height:.55,diameter:.5,tessellation:12},scene);bollard.position.set(69,3.5,z);bollard.material=steel;}
 const colors=['#51727c','#ad633d','#a18e54','#d1d4ce','#3d596d'];
 for(let k=0;k<5;k++){
  const mat=pbr('Контейнеры '+k,colors[k],.18,.59);
  const prototype=box('yard_container_'+k,[142+k*13,4.5,-170],[12.19,2.59,2.438],mat);
  for(let j=0;j<15;j++)for(let h=0;h<2+(j%2);h++){
   const m=prototype.createInstance(`container_${k}_${j}_${h}`);m.position.set(142+k*13,4.5+h*2.62,-170+j*5.4);
  }
 }
 // Minimal working quay crane, deliberately secondary to the water test.
 const z=-160;
 for(let dz of [-8,8])for(let x of [78,94])box('crane_leg',[x,22,z+dz],[1.0,38,1.0],steel);
 for(let dz of [-8,8]){box('crane_upper_beam',[86,42,z+dz],[20,2,1.6],steel);box('crane_boom',[42,45,z+dz],[100,1.4,1.1],steel);}
 box('crane_crossbeam',[20,45,z],[2.0,1.5,17],steel);
 for(let dz of [-3,3]){const cable=B.MeshBuilder.CreateCylinder('hoist_cable',{height:25,diameter:.07,tessellation:6},scene);cable.position.set(12,31.7,z+dz);cable.material=rubber;}
 box('spreader',[12,19,z],[3,.65,8],yellow);
}
function setupLighting(){
 settings.sunDirection=settings.sunset?new B.Vector3(-.75,.20,.45).normalize():new B.Vector3(-.6,.65,.4).normalize();
 sun.direction=settings.sunDirection.scale(-1);sun.diffuse=settings.sunset?new B.Color3(1,.72,.45):new B.Color3(1,.96,.89);sun.intensity=settings.sunset?2.4:2.6;
 skyMaterial.setVector3('sunDirection',settings.sunDirection);skyMaterial.setFloat('sunset',settings.sunset?1:0);scene.environmentIntensity=settings.sunset?.60:.8;
 $('day').classList.toggle('active',!settings.sunset);$('sunset').classList.toggle('active',settings.sunset);
}
function applyWaves(){if(!sim)return;sim.params.windSpeed=settings.wind;sim.params.waveScale=settings.waves;sim.dirty=true;$('wind-value').value=settings.wind.toFixed(1).replace('.',',')+' м/с';$('waves-value').value=Math.round(settings.waves*100)+'%';$('wind').value=settings.wind;$('waves').value=settings.waves;}
async function boot(){
 engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'},true);engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.25));
 scene=new B.Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new B.Color4(.38,.57,.66,1);scene.skipPointerMovePicking=true;
 scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.exposure=1.0;scene.imageProcessingConfiguration.contrast=1.04;
 camera=new B.ArcRotateCamera('Акватория',2.25,1.08,395,new B.Vector3(22,3,0),scene);camera.minZ=.25;camera.maxZ=70000;camera.lowerRadiusLimit=28;camera.upperRadiusLimit=1600;camera.upperBetaLimit=1.55;camera.lowerBetaLimit=.12;camera.wheelPrecision=8;camera.panningSensibility=35;camera.attachControl(canvas,true);camera.inertia=.78;
 canvas.addEventListener('pointerdown',()=>camGoal=null);canvas.addEventListener('wheel',()=>camGoal=null,{passive:true});
 scene.environmentTexture=B.CubeTexture.CreateFromPrefilteredData('./assets/environment.env',scene);
 const ambient=new B.HemisphericLight('Рассеянный свет',new B.Vector3(0,1,0),scene);ambient.intensity=.35;ambient.groundColor=new B.Color3(.17,.24,.29);
 sun=new B.DirectionalLight('Солнце',new B.Vector3(.6,-.65,-.4),scene);sun.position=new B.Vector3(-350,500,250);
 const sky=B.MeshBuilder.CreateBox('Небо',{size:50000},scene);sky.infiniteDistance=true;sky.isPickable=false;skyMaterial=new B.ShaderMaterial('Небо',scene,{vertexSource:skyVertex,fragmentSource:skyFragment},{attributes:['position'],uniforms:['worldViewProjection','sunDirection','sunset']});skyMaterial.backFaceCulling=false;skyMaterial.disableDepthWrite=true;sky.material=skyMaterial;
 buildPort();setupLighting();$('load-progress').style.width='25%';
 const result=await B.SceneLoader.ImportMeshAsync('', './assets/','container-ship.glb',scene,e=>{if(e.lengthComputable)$('load-progress').style.width=(25+e.loaded/e.total*45)+'%';});
 ship=new B.TransformNode('Судно',scene);
 for(const m of result.meshes){if(!m.parent)m.parent=ship;if(m.name.toLowerCase().includes('identity'))m.setEnabled(false);}
 ship.position.set(0,0,0);
 const shadows=new B.ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=B.ShadowGenerator.QUALITY_LOW;shadows.bias=.0005;shadows.normalBias=.02;
 for(const m of result.meshes){if(m.getTotalVertices()>0&&!m.name.includes('cargo'))shadows.addShadowCaster(m);}
 scene.meshes.forEach(m=>m.receiveShadows=true);
 $('load-message').textContent='Подготовка волн и отражений…';$('load-progress').style.width='80%';
 sim=new BabylonOceanSim(scene);
 mirror=new B.MirrorTexture('Отражение акватории',1024,scene,false,B.Constants.TEXTURETYPE_UNSIGNED_BYTE);mirror.mirrorPlane=new B.Plane(0,-1,0,-.02);mirror.renderList=scene.meshes.filter(m=>m.getTotalVertices()>0&&m.isEnabled());mirror.level=1;mirror.gammaSpace=false;mirror.clearColor=new B.Color4(.55,.72,.80,1);
 scene.customRenderTargets.push(mirror);
 water=createWater(scene,sim,mirror);applyWaves();
 let warm=0;
 engine.runRenderLoop(()=>{
  try{
   let dt=Math.min(engine.getDeltaTime()/1000,.05);
   if(camGoal){const t=1-Math.exp(-dt*5);camera.alpha=B.Scalar.Lerp(camera.alpha,camGoal.alpha,t);camera.beta=B.Scalar.Lerp(camera.beta,camGoal.beta,t);camera.radius=B.Scalar.Lerp(camera.radius,camGoal.radius,t);camera.setTarget(B.Vector3.Lerp(camera.target,camGoal.target,t));if(Math.abs(camera.radius-camGoal.radius)<.05)camGoal=null;}
   const ok=(!settings.paused||!sim.initialized)?sim.update(settings.paused?0:dt):true;
   if(ok){water.update(camera,settings);if(!ready&&++warm>2){ready=true;$('loading').classList.add('done');$('load-progress').style.width='100%';$('status').textContent='Babylon.js · FFT-волны';document.documentElement.dataset.state='ready';document.documentElement.dataset.engine=B.Engine.Version;}}
   scene.render();
   if(performance.now()-lastFPS>900){$('fps').textContent=Math.round(engine.getFps())+' FPS';lastFPS=performance.now();document.documentElement.dataset.meshes=scene.meshes.length;}
  }catch(e){engine.stopRenderLoop();console.error(e);fail(e.message);}
 });
 setTimeout(()=>{if(!ready){const errors=sim.passes.map(p=>p.effect?.getCompilationError()).filter(Boolean);if(errors.length)fail('Не удалось скомпилировать шейдеры воды: '+errors.join(' ').slice(0,350));}},20000);
 window.addEventListener('resize',()=>engine.resize());
}
$('wind').addEventListener('input',e=>{settings.wind=+e.target.value;applyWaves();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));});
$('waves').addEventListener('input',e=>{settings.waves=+e.target.value;applyWaves();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));});
$('reflections').addEventListener('change',e=>{settings.reflections=e.target.checked;if(mirror){scene.customRenderTargets=scene.customRenderTargets.filter(t=>t!==mirror);if(settings.reflections)scene.customRenderTargets.push(mirror);}});$('foam').addEventListener('change',e=>settings.foam=e.target.checked);
$('day').onclick=()=>{settings.sunset=false;setupLighting();};$('sunset').onclick=()=>{settings.sunset=true;setupLighting();};
$('pause').onclick=()=>{settings.paused=!settings.paused;$('pause').textContent=settings.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',settings.paused?'Продолжить волны':'Приостановить волны');$('pause').title=settings.paused?'Продолжить волны':'Приостановить волны';};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',!$('settings').hidden);};
$('quality').onchange=e=>{const q=e.target.value;engine.setHardwareScalingLevel(q==='high'?Math.max(1,devicePixelRatio/1.75):q==='low'?Math.max(1.5,devicePixelRatio):Math.max(1,devicePixelRatio/1.25));mirror.resize(q==='high'?1536:q==='low'?512:1024);engine.resize();};
// Quality changes render resolution and reflection target; FFT resolution stays fixed.
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p={calm:[3,.09],harbor:[5.8,.38],sea:[10.4,1.05]}[b.dataset.preset];[settings.wind,settings.waves]=p;applyWaves();document.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('active',x===b));});
if(matchMedia('(max-width: 700px)').matches){$('settings').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');}
boot().catch(e=>{console.error(e);fail(e.message);});
