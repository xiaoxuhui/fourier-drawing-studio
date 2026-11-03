import {test} from 'node:test';
import assert from 'node:assert/strict';
import {traceBinaryContours,imageContours,autoImageThreshold} from '../dist/contours.js';

function raster(width,height,pixel){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(pixel(x,y),(y*width+x)*4);
  return {width,height,data};
}
test('filled silhouette yields its actual ordered exterior boundary',()=>{
  const image=raster(12,12,(x,y)=>x>=3&&x<9&&y>=2&&y<10?[0,0,0,255]:[255,255,255,255]);
  const contours=imageContours(image);
  assert.equal(contours.length,1);assert.equal(contours[0].area,48);assert.equal(contours[0].hole,false);assert.equal(contours[0].points.length,4);
  assert.deepEqual(contours[0].points,[{x:3,y:2},{x:9,y:2},{x:9,y:10},{x:3,y:10}]);
});
test('holes and disconnected silhouettes remain distinct selectable contours',()=>{
  const image=raster(20,20,(x,y)=>{const outer=x>=2&&x<12&&y>=2&&y<12,hole=x>=5&&x<9&&y>=5&&y<9,second=x>=15&&x<18&&y>=15&&y<18;return outer&&!hole||second?[0,0,0,255]:[255,255,255,255];});
  const contours=imageContours(image);
  assert.deepEqual(contours.map(c=>[c.area,c.hole]),[[100,false],[16,true],[9,false]]);
});
test('diagonally touching pixels form one eight-connected stroke',()=>{
  const mask=new Uint8Array(9);mask[0]=mask[4]=mask[8]=1;
  const paths=traceBinaryContours(mask,3,3);
  assert.equal(paths.length,1);assert.equal(paths[0].area,3);
});
test('inversion selects light silhouettes and fully transparent pixels stay background',()=>{
  const image=raster(12,12,(x,y)=>x>=3&&x<9&&y>=3&&y<9?[255,255,255,255]:[0,0,0,255]);
  assert.equal(imageContours(image,{invert:true})[0].area,36);
  const transparent=raster(12,12,(x,y)=>x>=3&&x<9&&y>=3&&y<9?[0,0,0,255]:[0,0,0,0]);
  assert.equal(imageContours(transparent)[0].area,36);
  assert.equal(imageContours(raster(12,12,()=>[255,255,255,255])).length,0);
  assert.equal(imageContours(raster(12,12,()=>[0,0,0,0]),{invert:true}).length,0);
});
test('automatic threshold separates dark and bright pixels and removes isolated noise',()=>{
  const image=raster(20,20,(x,y)=>x>=3&&x<13&&y>=3&&y<13?[40,40,40,255]:x===18&&y===18?[0,0,0,255]:[230,230,230,255]);
  const threshold=autoImageThreshold(image.data);
  assert.ok(threshold>=40&&threshold<230);
  assert.equal(imageContours(image,{threshold}).length,1);
});
