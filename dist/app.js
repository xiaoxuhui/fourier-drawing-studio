import {TAU, DURATION, MAX_CIRCLES, normalize, resampleClosed, transform, endpoint, parseVector, termsFromVectors, parseParameterTable, serializeVector, desmosParameters, serializeDesmosList} from './fourier.js';
import {autoImageThreshold,imageContours} from './contours.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), wrap = $('canvas-wrap');
let width=0,height=0,scale=1,dpr=1,source=[],data,curve=[],count=40,time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,speed=.1,last=0;
let drawMode=false,stroke=[],pointer=null,wasPlaying=false,currentName='爱心',toastTimer;
let fourierData,customMode=false,viewExtent=1,curveSteps=1024,tableCells=[],lastTableTime=-Infinity;
const names={heart:'爱心',star:'星星',butterfly:'蝴蝶',flower:'花朵'};

function preset(name) {
  const pts=[];
  if(name==='star') {
    for(let i=0;i<10;i++){const a=i*TAU/10-Math.PI/2,r=i%2?.44:1;pts.push({x:r*Math.cos(a),y:r*Math.sin(a)});}
  } else {
    for(let i=0;i<800;i++) {
      const t=TAU*i/800;
      if(name==='heart') pts.push({x:16*Math.sin(t)**3,y:-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))});
      if(name==='flower'){const r=.7+.27*Math.cos(5*t);pts.push({x:r*Math.cos(t),y:r*Math.sin(t)});}
      if(name==='butterfly'){const r=Math.exp(Math.cos(t))-2*Math.cos(4*t)+Math.sin(t/12)**5;pts.push({x:Math.sin(t)*r,y:-Math.cos(t)*r});}
    }
  }
  return pts;
}

function loadShape(points,name) {
  source=resampleClosed(normalize(points));data=transform(source);fourierData=data;customMode=false;currentName=name;
  $('shape-name').textContent=name;
  rebuild();
}

function rebuild() {
  time=0;
  const maxFrequency=Math.max(...data.terms.slice(0,count).map(c=>Math.abs(c.freq)),1);
  curveSteps=Math.min(32768,Math.max(1024,Math.ceil(maxFrequency*16)));
  curve=Array.from({length:curveSteps+1},(_,i)=>endpoint(data,count,i/curveSteps));
  const total=data.terms.reduce((sum,c)=>sum+c.amp*c.amp,0);
  const retained=data.terms.slice(0,count).reduce((sum,c)=>sum+c.amp*c.amp,0);
  const error=Math.sqrt(Math.max(0,total-retained)/Math.max(total,1e-20))*100;
  $('accuracy').textContent=customMode?'自定义矩阵 · 9 秒模拟时段':`相对均方根误差 ${error<.01?'< 0.01':error.toFixed(2)}%`;
  viewExtent=1;
  if(customMode){
    for(const p of curve)viewExtent=Math.max(viewExtent,Math.abs(p.x),Math.abs(p.y));
    for(let j=0;j<=24;j++){
      let x=data.center.x,y=data.center.y;
      for(const c of data.terms.slice(0,count)){
        viewExtent=Math.max(viewExtent,Math.abs(x)+c.amp,Math.abs(y)+c.amp);
        const a=TAU*c.freq*j/24+c.phase;x+=c.amp*Math.cos(a);y+=c.amp*Math.sin(a);
      }
    }
  }
  scale=Math.min(width,height)*.31/viewExtent;
  refreshParameters();sync();render();
}

function setCount(value) {
  count=Math.max(1,Math.min(MAX_CIRCLES,Math.round(Number(value)||1)));
  if(customMode)while(data.terms.length<count)data.terms.push({freq:0,phase:0,amp:0,re:0,im:0});
  $('count').value=count;$('count-number').value=count;$('circle-stat').textContent=count;
  $('count').style.background=`linear-gradient(to right,#21735b ${(count-1)/(MAX_CIRCLES-1)*100}%,#e1e7dd ${(count-1)/(MAX_CIRCLES-1)*100}%)`;
  document.querySelectorAll('[data-count]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.count)===count);b.setAttribute('aria-pressed',String(Number(b.dataset.count)===count));});
  if(data)rebuild();
}

function sync() {
  $('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'暂停动画':'播放动画');
  $('mode-label').textContent=drawMode?'手绘模式':playing?'正在描绘':'已暂停';
  $('simulation-time').textContent=`t = ${(time*DURATION).toFixed(2)} s`;
  document.querySelector('.cycle-label').textContent=customMode?'9 秒时段':'一个周期';
  $('timeline').value=Math.round(time*1000);$('progress').textContent=Math.round(time*100)+'%';
  $('timeline').style.background=`linear-gradient(to right,#83a98d ${time*100}%,#e1e7dd ${time*100}%)`;
}

function resize() {
  const rect=wrap.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  scale=Math.min(width,height)*.31/(drawMode?1:viewExtent);render();
}
function path(points,close=false) {
  if(!points.length)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);if(close)ctx.closePath();ctx.stroke();
}

function render() {
  if(!width||!data)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  ctx.translate(width/2,height/2);ctx.scale(scale,scale);
  // Quiet coordinate axes establish the common origin without competing with the drawing.
  ctx.strokeStyle='#e8eee3';ctx.lineWidth=1/scale;ctx.beginPath();ctx.moveTo(-width/2/scale,0);ctx.lineTo(width/2/scale,0);ctx.moveTo(0,-height/2/scale);ctx.lineTo(0,height/2/scale);ctx.stroke();
  if(drawMode) {
    ctx.strokeStyle='#21735b';ctx.lineWidth=2.4/scale;ctx.lineCap='round';ctx.lineJoin='round';path(stroke);
    if(stroke.length>1){ctx.setLineDash([4/scale,5/scale]);ctx.lineWidth=1/scale;ctx.strokeStyle='#b1bda9';path([stroke.at(-1),stroke[0]]);ctx.setLineDash([]);}
    return;
  }
  if($('reference').checked){ctx.strokeStyle='#bdc9b4';ctx.lineWidth=1.2/scale;ctx.setLineDash([3/scale,5/scale]);path(source,true);ctx.setLineDash([]);}
  let x=data.center.x,y=data.center.y;
  if($('circles').checked) {
    data.terms.slice(0,count).forEach((c,i)=>{
      if(c.amp*scale>.45){ctx.beginPath();ctx.arc(x,y,c.amp,0,TAU);ctx.strokeStyle=i<3?'#82a18d80':'#9caf9260';ctx.lineWidth=1/scale;ctx.stroke();}
      const a=TAU*c.freq*time+c.phase, nx=x+c.amp*Math.cos(a),ny=y+c.amp*Math.sin(a);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.strokeStyle='#69947999';ctx.lineWidth=1/scale;ctx.stroke();
      if(i<7){ctx.beginPath();ctx.arc(x,y,1.8/scale,0,TAU);ctx.fillStyle='#5e8969';ctx.fill();}
      if($('circle-numbers').checked){ctx.font=`${10/scale}px monospace`;ctx.fillStyle='#416d55';ctx.fillText(String(i+1),x+4/scale,y-5/scale);}
      x=nx;y=ny;
    });
  }else{const p=endpoint(data,count,time);x=p.x;y=p.y;}
  const end=Math.floor(time*curveSteps),partial=curve.slice(0,end+1);partial.push({x,y});
  ctx.strokeStyle='#e47b60';ctx.lineWidth=2.7/scale;ctx.lineCap='round';ctx.lineJoin='round';path(partial);
  ctx.beginPath();ctx.arc(x,y,7/scale,0,TAU);ctx.fillStyle='#e47b6020';ctx.fill();
  ctx.beginPath();ctx.arc(x,y,3.1/scale,0,TAU);ctx.fillStyle='#e47b60';ctx.fill();
  ctx.beginPath();ctx.arc(data.center.x,data.center.y,2.5/scale,0,TAU);ctx.fillStyle='#4b8061';ctx.fill();
  updateLiveTable();
}

function animate(now) {
  if(last&&playing&&!drawMode&&!document.hidden){time+=Math.min((now-last)/1000,.1)*speed/DURATION;if(time>1){if(customMode){time=1;playing=false;}else time%=1;}sync();render();}
  last=now;if(playing&&!drawMode)render();requestAnimationFrame(animate);
}

function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
function enterDraw() {
  if(drawMode)return;wasPlaying=playing;drawMode=true;playing=false;stroke=[];pointer=null;
  wrap.classList.add('drawing');$('draw').classList.add('active');$('drawing-actions').hidden=false;$('draw-hint').hidden=false;
  $('convert').disabled=true;$('draw-note').textContent='请一笔画完，首尾会自动连接。';
  for(const id of ['play','restart','timeline','export'])$(id).disabled=true;
  scale=Math.min(width,height)*.31;sync();render();
}
function leaveDraw(resume=wasPlaying) {
  drawMode=false;pointer=null;wrap.classList.remove('drawing');$('draw').classList.remove('active');$('drawing-actions').hidden=true;$('draw-hint').hidden=true;
  $('draw-note').textContent='也可以直接选一个示例开始探索。';
  for(const id of ['play','restart','timeline','export'])$(id).disabled=false;
  playing=resume;scale=Math.min(width,height)*.31/viewExtent;sync();render();
}
function position(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left-width/2)/scale,y:(event.clientY-r.top-height/2)/scale};}

canvas.addEventListener('pointerdown',event=>{
  if(!drawMode||pointer!==null||(event.pointerType==='mouse'&&event.button!==0))return;
  event.preventDefault();pointer=event.pointerId;stroke=[position(event)];canvas.setPointerCapture(pointer);$('draw-hint').hidden=true;$('convert').disabled=true;render();
});
canvas.addEventListener('pointermove',event=>{
  if(!drawMode||pointer!==event.pointerId)return;event.preventDefault();
  for(const e of event.getCoalescedEvents?.()||[event]){const p=position(e);if(Math.hypot(p.x-stroke.at(-1).x,p.y-stroke.at(-1).y)>1.5/scale)stroke.push(p);}
  render();
});
function finishStroke(event){if(pointer!==event.pointerId)return;pointer=null;$('convert').disabled=stroke.length<4;render();}
canvas.addEventListener('pointerup',finishStroke);canvas.addEventListener('pointercancel',finishStroke);
$('draw').onclick=enterDraw;
$('redraw').onclick=()=>{stroke=[];$('draw-hint').hidden=false;$('convert').disabled=true;render();};
$('cancel-draw').onclick=()=>leaveDraw();
$('convert').onclick=()=>{
  if(stroke.length<4){toast('请先画出一条完整的线。');return;}
  try{const points=[...stroke];loadShape(points,'我的手绘');leaveDraw(true);document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});toast('转换完成，试着改变圆圈数量。');}catch(error){toast(error.message);}
};
document.querySelectorAll('[data-preset]').forEach(button=>{button.setAttribute('aria-pressed',String(button.classList.contains('active')));button.onclick=()=>{if(drawMode)leaveDraw(false);loadShape(preset(button.dataset.preset),names[button.dataset.preset]);playing=true;document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});sync();};});
document.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>setCount(b.dataset.count));
$('count').oninput=event=>setCount(event.target.value);
$('count-number').onchange=event=>setCount(event.target.value);
$('count-number').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();setCount(event.target.value);event.target.blur();}};
$('speed').onchange=event=>setUniformSpeed(event.target.value);
$('circles').onchange=render;$('reference').onchange=render;
$('circle-numbers').onchange=render;
$('play').onclick=()=>{playing=!playing;if(time>=1&&playing)time=0;sync();render();};
$('restart').onclick=()=>{time=0;playing=true;sync();render();};
$('timeline').oninput=event=>{time=Number(event.target.value)/1000;playing=false;sync();render();};
$('export').onclick=()=>{
  const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;
  const c=output.getContext('2d');c.fillStyle='#fcfdfb';c.fillRect(0,0,output.width,output.height);c.drawImage(canvas,0,0);
  output.toBlob(blob=>{if(!blob){toast('图片生成失败，请重试。');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`傅里叶画室-${currentName}-${count}个圆.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('图片已生成。');});
};
document.addEventListener('keydown',event=>{
  if(event.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA','A'].includes(event.target.tagName)&&!drawMode){event.preventDefault();$('play').click();}
  if(event.code==='Escape'&&drawMode)leaveDraw();
});

const format=n=>Number(n.toPrecision(12)).toString();
const short=n=>Math.abs(n)<1e-9?'0':Number(n.toPrecision(6)).toString();
const matrixIds=['omega-matrix','phase-matrix','radius-matrix'];

function refreshParameters(){
  const terms=data.terms.slice(0,count);
  $('matrix-count').textContent=count;
  $('center-value').textContent=`(${short(data.center.x)}, ${short(data.center.y)})`;
  const values=[terms.map(c=>c.freq*TAU/DURATION),terms.map(c=>c.phase),terms.map(c=>c.amp)];
  matrixIds.forEach((id,i)=>{$(id).value=values[i].map(format).join('\n');$(id).removeAttribute('aria-invalid');});
  updateSelectionButtons();
  $('matrix-error').hidden=true;
  $('matrix-status').textContent=customMode?'自定义参数已应用；改变数量会保留已有圆，新增圆的三个参数均为 0。':'正在显示原图的傅里叶参数，按半径从大到小排列。';
  const fragment=document.createDocumentFragment();tableCells=[];
  terms.forEach((c,i)=>{
    const row=document.createElement('tr');
    const cells=[String(i+1),short(c.freq*TAU/DURATION),short(c.phase),short(c.amp),'','',''].map(value=>{const td=document.createElement('td');td.textContent=value;row.append(td);return td;});
    fragment.append(row);tableCells.push(cells);
  });
  $('parameter-rows').replaceChildren(fragment);lastTableTime=-Infinity;updateLiveTable(true);
  refreshDesmos();
}

function refreshDesmos(){
  const domain=Number($('desmos-domain').value),includeCenter=$('desmos-center').checked;
  const vectors=desmosParameters(data,count,{domain,includeCenter,speedScale:speed});
  for(const name of ['a','b','c'])$(`desmos-${name}`).value=serializeDesmosList(vectors[name].map(n=>Number(format(n))));
  $('desmos-summary').textContent=`当前图形：${currentName} · ${vectors.a.length} 项 · 转速统一 ×${format(speed)} · Desmos 使用弧度制，t 的范围设为 0–${format(vectors.tMax)}。`;
  $('speed-scale-note').textContent=`所有圆的转速同时乘以 ${format(speed)}，保持方向和速度比例；a、b 不变。当前需绘制到 t = ${format(vectors.tMax)} 才能描完同一段轨迹。`;
}

function setUniformSpeed(value){
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<=0){$('uniform-speed').value=speed;toast('请输入大于 0 的速度倍率。');return;}
  speed=Math.max(.001,Math.min(4,parsed));$('uniform-speed').value=speed;
  let option=Array.from($('speed').options).find(item=>Number(item.value)===speed);
  if(!option){option=new Option(`${format(speed)}×`,String(speed));option.dataset.custom='true';$('speed').add(option);}
  $('speed').value=String(speed);
  for(const item of Array.from($('speed').options))if(item.dataset.custom&&item!==option)item.remove();
  refreshDesmos();sync();
}

function updateLiveTable(force=false){
  if(!$('parameter-details').open)return;
  const now=performance.now();if(!force&&playing&&now-lastTableTime<150)return;lastTableTime=now;
  let x=data.center.x,y=data.center.y;
  data.terms.slice(0,count).forEach((c,i)=>{
    const a=TAU*c.freq*time+c.phase,nx=x+c.amp*Math.cos(a),ny=y+c.amp*Math.sin(a),cells=tableCells[i];
    if(cells){cells[4].textContent=short((a%TAU+TAU)%TAU);cells[5].textContent=`(${short(x)}, ${short(y)})`;cells[6].textContent=`(${short(nx)}, ${short(ny)})`;}
    x=nx;y=ny;
  });
}

function applyMatrices(){
  if(drawMode){toast('请先完成或取消手绘，再应用矩阵。');return;}
  try{
    const vectors=matrixIds.map((id,i)=>parseVector($(id).value,['角速度矩阵','初始角度矩阵','半径矩阵'][i]));
    const terms=termsFromVectors(...vectors);
    data={center:{...fourierData.center},terms};customMode=true;
    $('shape-name').textContent=`自定义 · ${currentName}`;
    document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
    playing=true;setCount(terms.length);toast(`已应用 ${terms.length} 个圆的参数。`);
  }catch(error){$('matrix-error').textContent=error.message;$('matrix-error').hidden=false;}
}
matrixIds.forEach(id=>$(id).addEventListener('input',()=>{$('matrix-status').textContent='矩阵已修改，点击「应用矩阵并播放」生效。';$('matrix-error').hidden=true;}));
$('apply-matrices').onclick=applyMatrices;
$('restore-fourier').onclick=()=>{
  if(drawMode){toast('请先完成或取消手绘。');return;}
  data=fourierData;customMode=false;$('shape-name').textContent=currentName;setCount(count);toast('已恢复原图的傅里叶参数。');
};
$('example-matrices').onclick=()=>{
  $('omega-matrix').value='0.698131700798\n-2.094395102393\n3.490658503989';
  $('phase-matrix').value='0\n1.570796326795\n0';
  $('radius-matrix').value='0.7\n0.25\n0.12';
  applyMatrices();
};
$('parameter-details').ontoggle=()=>updateLiveTable(true);
$('import-table').onclick=()=>{
  try{
    if(drawMode)throw new Error('请先完成或取消手绘，再导入参数。');
    const vectors=parseParameterTable($('table-paste').value);
    matrixIds.forEach((id,i)=>{$(id).value=vectors[i].map(format).join('\n');});
    applyMatrices();
  }catch(error){$('paste-error').textContent=error.message;$('paste-error').hidden=false;return;}
  $('paste-error').hidden=true;
};
$('table-paste').addEventListener('input',()=>{$('paste-error').hidden=true;});

async function copyParameterText(text,message='已复制，数字之间带逗号，外层带中括号。'){
  const fallback=$('copy-output');
  try{
    if(!navigator.clipboard?.writeText)throw new Error();
    await navigator.clipboard.writeText(text);$('copy-fallback').hidden=true;toast(message);
  }catch{
    fallback.value=text;$('copy-fallback').hidden=false;fallback.focus();fallback.select();
    toast('复制内容已选中，按 Ctrl + C 即可。');
  }
}
document.querySelectorAll('[data-copy-matrix]').forEach(button=>button.onclick=()=>{
  try{copyParameterText(serializeVector(parseVector($(button.dataset.copyMatrix).value),$('copy-shape').value));}
  catch(error){$('matrix-error').textContent=error.message;$('matrix-error').hidden=false;}
});
function selectedMatrixText(field){
  const start=field.selectionStart,end=field.selectionEnd,text=field.value.slice(start,end);
  if(!text)return '';
  const numeric=char=>Boolean(char&&/[0-9.eE+-]/.test(char));
  // Copy a fragment of a number literally; complete numbers use the matrix format.
  if((numeric(field.value[start-1])&&numeric(text[0]))||(numeric(text.at(-1))&&numeric(field.value[end])))return text;
  const full=start===0&&end===field.value.length;
  const value=full?text:text.replace(/[\[\]【】]/g,'').replace(/^[\s,;，；]+|[\s,;，；]+$/g,'');
  try{return serializeVector(parseVector(value),$('copy-shape').value);}catch{return text;}
}
function updateSelectionButtons(){
  document.querySelectorAll('[data-copy-selection]').forEach(button=>{
    const field=$(button.dataset.copySelection);button.disabled=field.selectionStart===field.selectionEnd;
  });
}
document.querySelectorAll('[data-copy-selection]').forEach(button=>button.onclick=()=>{
  const text=selectedMatrixText($(button.dataset.copySelection));
  if(!text){toast('请先在这组矩阵里选中要复制的数字。');return;}
  copyParameterText(text,'已复制所选内容。');
});
matrixIds.forEach(id=>{
  for(const event of ['select','input','keyup','mouseup','focus'])$(id).addEventListener(event,updateSelectionButtons);
  $(id).addEventListener('copy',event=>{
    const text=selectedMatrixText($(id));if(!text||!event.clipboardData)return;
    event.clipboardData.setData('text/plain',text);event.preventDefault();toast('已复制所选内容。');
  });
});
document.addEventListener('selectionchange',updateSelectionButtons);
$('copy-all-parameters').onclick=()=>{
  try{
    const vectors=matrixIds.map(id=>parseVector($(id).value));termsFromVectors(...vectors);
    const rows=vectors[0].map((_,i)=>vectors.map(vector=>vector[i]));
    copyParameterText(JSON.stringify(rows));
  }catch(error){$('matrix-error').textContent=error.message;$('matrix-error').hidden=false;}
};
$('desmos-domain').onchange=refreshDesmos;
$('uniform-speed').onchange=event=>setUniformSpeed(event.target.value);
$('uniform-speed').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();setUniformSpeed(event.target.value);event.target.blur();}};
$('desmos-center').onchange=refreshDesmos;
document.querySelectorAll('[data-copy-desmos]').forEach(button=>button.onclick=()=>copyParameterText($(`desmos-${button.dataset.copyDesmos}`).value,`已复制适配你的 Desmos 公式的 ${button.dataset.copyDesmos} 列表。`));

let imagePixels=null,imagePaths=[],imageName='',imageWasPlaying=false,imageCommitted=false,imageTimer,imageLoadId=0;
function updateImagePreview(){
  const index=Number($('image-contour').value),selected=imagePaths[index],preview=$('image-outline'),paint=preview.getContext('2d');
  paint.clearRect(0,0,preview.width,preview.height);paint.fillStyle='#fcfdfb';paint.fillRect(0,0,preview.width,preview.height);
  if(selected){
    paint.beginPath();selected.points.forEach((p,i)=>i?paint.lineTo(p.x,p.y):paint.moveTo(p.x,p.y));paint.closePath();
    paint.fillStyle='#e47b6015';paint.fill();paint.strokeStyle='#21735b';paint.lineWidth=1.5;paint.stroke();
    $('image-status').textContent=`找到 ${imagePaths.length} 条候选轮廓，已选择第 ${index+1} 条${selected.hole?'（内部孔洞）':'（外轮廓）'}。`;
  }else $('image-status').textContent='未找到可用轮廓，请调整阈值或切换深浅背景。';
  $('convert-image').disabled=!selected;
}
function findImageContours(){
  clearTimeout(imageTimer);if(!imagePixels)return;
  $('image-error').hidden=true;
  try{
    imagePaths=imageContours(imagePixels,{threshold:Number($('image-threshold').value),invert:$('image-invert').checked});
    const options=imagePaths.map((contour,i)=>new Option(`轮廓 ${i+1} · ${contour.hole?'内部孔洞':'外轮廓'} · 面积 ${contour.area}`,String(i)));
    $('image-contour').replaceChildren(...options);$('image-contour').disabled=!options.length;
    updateImagePreview();
  }catch(error){imagePaths=[];$('convert-image').disabled=true;$('image-error').textContent='轮廓提取失败，请尝试更简单的图案。';$('image-error').hidden=false;}
}
async function loadImageFile(file){
  if(!file)return;
  if(file.size>25*1024*1024){toast('图片超过 25 MB，请先缩小后再导入。');return;}
  const id=++imageLoadId,url=URL.createObjectURL(file),picture=new Image();
  try{
    picture.src=url;await picture.decode();if(id!==imageLoadId)return;
    const imageScale=Math.min(1,384/Math.max(picture.naturalWidth,picture.naturalHeight));
    const w=Math.max(1,Math.round(picture.naturalWidth*imageScale)),h=Math.max(1,Math.round(picture.naturalHeight*imageScale));
    const buffer=document.createElement('canvas');buffer.width=w+4;buffer.height=h+4;
    const brush=buffer.getContext('2d',{willReadFrequently:true});brush.drawImage(picture,2,2,w,h);imagePixels=brush.getImageData(0,0,buffer.width,buffer.height);
    for(const target of ['image-original','image-outline']){$(target).width=buffer.width;$(target).height=buffer.height;}
    const preview=$('image-original').getContext('2d');preview.fillStyle='#fff';preview.fillRect(0,0,buffer.width,buffer.height);preview.drawImage(buffer,0,0);
    imageName=file.name.replace(/\.[^.]+$/,'').slice(0,60)||'导入图形';
    $('image-invert').checked=false;
    const threshold=autoImageThreshold(imagePixels.data);$('image-threshold').value=threshold;$('threshold-value').value=threshold;
    if(drawMode)leaveDraw(false);
    if(!$('image-dialog').open){imageWasPlaying=playing;playing=false;$('image-dialog').showModal();}
    imageCommitted=false;sync();findImageContours();
  }catch(error){toast('无法读取这张图片，请选择 PNG、JPG、WebP 等有效图片。');}
  finally{URL.revokeObjectURL(url);}
}
$('import-image').onclick=()=>$('image-file').click();
$('image-file').onchange=event=>{loadImageFile(event.target.files[0]);event.target.value='';};
$('image-threshold').oninput=event=>{$('threshold-value').value=event.target.value;$('convert-image').disabled=true;clearTimeout(imageTimer);imageTimer=setTimeout(findImageContours,80);};
$('image-invert').onchange=findImageContours;
$('auto-threshold').onclick=()=>{if(!imagePixels)return;const value=autoImageThreshold(imagePixels.data);$('image-threshold').value=value;$('threshold-value').value=value;findImageContours();};
$('image-contour').onchange=updateImagePreview;
$('close-image').onclick=()=>$('image-dialog').close();$('cancel-image').onclick=()=>$('image-dialog').close();
$('image-dialog').addEventListener('close',()=>{clearTimeout(imageTimer);playing=imageCommitted?true:imageWasPlaying;sync();render();});
$('convert-image').onclick=()=>{
  const contour=imagePaths[Number($('image-contour').value)];if(!contour)return;
  try{
    loadShape(contour.points,`图片 · ${imageName}`);imageCommitted=true;$('image-dialog').close();
    document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
    toast('图片轮廓已转换，可以调节圆数或复制 Desmos 参数。');
  }catch(error){$('image-error').textContent=error.message;$('image-error').hidden=false;}
};
wrap.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();wrap.classList.add('image-dragover');}});
wrap.addEventListener('dragleave',()=>wrap.classList.remove('image-dragover'));
wrap.addEventListener('drop',event=>{event.preventDefault();wrap.classList.remove('image-dragover');loadImageFile(event.dataTransfer.files[0]);});
new ResizeObserver(resize).observe(wrap);
loadShape(preset('heart'),'爱心');setCount(40);resize();requestAnimationFrame(animate);
