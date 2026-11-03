export function autoImageThreshold(rgba) {
  const histogram=new Float64Array(256);let total=0,sum=0;
  for(let i=0;i<rgba.length;i+=4){
    const alpha=rgba[i+3]/255;if(alpha<.03)continue;
    const gray=Math.round((.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2])*alpha+255*(1-alpha));
    histogram[gray]++;total++;sum+=gray;
  }
  let weight=0,subtotal=0,best=0,threshold=160;
  for(let t=0;t<255;t++){
    weight+=histogram[t];subtotal+=histogram[t]*t;
    if(!weight||weight===total)continue;
    const variance=weight*(total-weight)*(subtotal/weight-(sum-subtotal)/(total-weight))**2;
    if(variance>best){best=variance;threshold=t;}
  }
  return threshold;
}

// Trace cell boundaries in order; diagonal contacts stay in the same 8-connected stroke.
export function traceBinaryContours(mask,width,height) {
  const edges=[],outgoing=new Map(),stride=width+1;
  function add(x,y,nx,ny,direction){
    const from=y*stride+x,to=ny*stride+nx,index=edges.length;
    edges.push({from,to,direction,used:false});
    if(!outgoing.has(from))outgoing.set(from,[]);outgoing.get(from).push(index);
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(!mask[y*width+x])continue;
    if(y===0||!mask[(y-1)*width+x])add(x,y,x+1,y,0);
    if(x===width-1||!mask[y*width+x+1])add(x+1,y,x+1,y+1,1);
    if(y===height-1||!mask[(y+1)*width+x])add(x+1,y+1,x,y+1,2);
    if(x===0||!mask[y*width+x-1])add(x,y+1,x,y,3);
  }
  const contours=[];
  for(let first=0;first<edges.length;first++){
    if(edges[first].used)continue;
    const points=[],start=edges[first].from;let index=first,closed=false;
    for(let guard=0;guard<=edges.length;guard++){
      const edge=edges[index];if(edge.used)break;edge.used=true;
      points.push({x:edge.from%stride,y:Math.floor(edge.from/stride)});
      if(edge.to===start){closed=true;break;}
      const next=(outgoing.get(edge.to)||[]).filter(i=>!edges[i].used);
      if(!next.length)break;
      const priority=[1,2,3,0];
      next.sort((a,b)=>priority[(edges[a].direction-edge.direction+4)%4]-priority[(edges[b].direction-edge.direction+4)%4]);
      index=next[0];
    }
    if(!closed||points.length<3)continue;
    let signedArea=0;
    for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];signedArea+=p.x*q.y-q.x*p.y;}
    signedArea/=2;
    const corners=points.filter((p,i)=>{const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];return (p.x-before.x)*(after.y-p.y)!==(p.y-before.y)*(after.x-p.x);});
    const step=Math.max(1,Math.ceil(corners.length/16384));
    contours.push({points:corners.filter((_,i)=>i%step===0),area:Math.abs(signedArea),hole:signedArea<0});
  }
  return contours.sort((a,b)=>b.area-a.area);
}

export function imageContours({data,width,height},{threshold=160,invert=false,minArea=3}={}) {
  const mask=new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++){
    const offset=i*4,alpha=data[offset+3]/255;
    const gray=(.2126*data[offset]+.7152*data[offset+1]+.0722*data[offset+2])*alpha+255*(1-alpha);
    mask[i]=alpha>=.03&&(invert?gray>=threshold:gray<=threshold)?1:0;
  }
  return traceBinaryContours(mask,width,height).filter(c=>c.area>=minArea&&c.points.length>=3).slice(0,100);
}
