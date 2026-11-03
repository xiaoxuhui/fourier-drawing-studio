import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transform, endpoint, resampleClosed, TAU, DURATION, parseVector, termsFromVectors, parseParameterTable, serializeVector, desmosParameters, normalize, serializeDesmosList} from '../dist/fourier.js';

test('full Fourier reconstruction preserves an arbitrary complex path and its translation', () => {
  const points = Array.from({length: 64}, (_, i) => ({x: 2 + Math.cos(TAU * i / 64) + .3 * Math.cos(5 * TAU * i / 64), y: -3 + Math.sin(2 * TAU * i / 64)}));
  const data = transform(points);
  points.forEach((p, i) => {const r = endpoint(data, 63, i / 64); assert.ok(Math.hypot(r.x - p.x, r.y - p.y) < 1e-11);});
});

test('one circle reconstructs a clockwise circle', () => {
  const points = Array.from({length: 64}, (_, i) => ({x: Math.cos(TAU * i / 64), y: -Math.sin(TAU * i / 64)}));
  const data = transform(points);
  assert.equal(data.terms[0].freq, -1);
  assert.ok(Math.abs(data.terms[0].amp - 1) < 1e-12);
  assert.ok(Math.abs(endpoint(data, 1, .25).y + 1) < 1e-12);
});

test('arc length resampling includes the closing edge and ignores duplicate points', () => {
  const samples = resampleClosed([{x:0,y:0},{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}], 8);
  assert.deepEqual(samples, [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1},{x:2,y:2},{x:1,y:2},{x:0,y:2},{x:0,y:1}]);
  assert.throws(() => resampleClosed([{x:0,y:0},{x:0,y:0}]));
});

test('adding coefficients cannot increase mean squared reconstruction error', () => {
  const pts = resampleClosed([{x:0,y:0},{x:2,y:0},{x:1,y:1},{x:0,y:2}],64), data = transform(pts);
  let previous = Infinity;
  for (const count of [1, 5, 20, 63]) {
    const error = pts.reduce((s,p,i) => {const q = endpoint(data,count,i/64); return s+(p.x-q.x)**2+(p.y-q.y)**2;},0);
    assert.ok(error <= previous + 1e-12); previous=error;
  }
});

test('pasted vector formats preserve values, signs and scientific notation', () => {
  for(const text of ['[1; -2; 3e-2]','1\n-2\n.03','[1, -2, 0.03]','[[1, -2, 0.03]]','[[1],[-2],[0.03]]','【1，−2，0.03】']) assert.deepEqual(parseVector(text),[1,-2,.03]);
  for(const text of ['','[[1,2],[3,4]]','[1,null]','[1, NaN]','[Infinity]','1e999','[1+2]']) assert.throws(()=>parseVector(text));
});

test('copy formats include commas and brackets and round trip without changing numerical values',()=>{
  const values=[1,-2,.03,1e-12];
  for(const shape of ['vector','row','column']){
    const text=serializeVector(values,shape);
    assert.ok(text.startsWith('[')&&text.endsWith(']')&&text.includes(', '));
    assert.deepEqual(parseVector(text),values);
  }
  assert.equal(serializeVector([1,2,3]),'[1, 2, 3]');
  assert.equal(serializeVector([1,2,3],'row'),'[[1, 2, 3]]');
  assert.equal(serializeVector([1,2,3],'column'),'[[1], [2], [3]]');
});

test('custom parameters use radians per simulated second and preserve row order', () => {
  const data={center:{x:0,y:0},terms:termsFromVectors([Math.PI/2,0],[0,Math.PI/2],[1,.5])};
  const p=endpoint(data,2,1/DURATION);
  assert.ok(Math.abs(p.x)<1e-12);assert.ok(Math.abs(p.y-1.5)<1e-12);
  assert.equal(data.terms[0].amp,1);assert.equal(data.terms[1].amp,.5);
  assert.throws(()=>termsFromVectors([1],[0,1],[1]));
  assert.throws(()=>termsFromVectors([1],[0],[-1]));
  assert.throws(()=>termsFromVectors([NaN],[0],[1]));
});

test('Excel TSV, CSV, MATLAB matrices and JSON rows import the same parameter table',()=>{
  const expected=[[1,-2],[0,1.57],[.7,.2]];
  for(const text of ['1\t0\t0.7\r\n-2\t1.57\t.2','1,0,.7\n-2,1.57,.2','[1 0 .7; -2 1.57 .2]','[[1,0,.7],[-2,1.57,.2]]'.replaceAll('.7','0.7').replaceAll('.2','0.2')]) assert.deepEqual(parseParameterTable(text),expected);
  for(const text of ['1\t0','[[1,0,-1]]','speed angle radius\n1 0 1','[]']) assert.throws(()=>parseParameterTable(text));
});

test('Desmos export reproduces an upright heart in the user-provided sin/cos formula',()=>{
  const heart=Array.from({length:800},(_,i)=>{const t=TAU*i/800;return {x:16*Math.sin(t)**3,y:-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))};});
  const samples=resampleClosed(normalize(heart)),data=transform(samples),k=200*Math.PI/180;
  for(const domain of [1,9])for(const includeCenter of [false,true]){
    const {a,b,c}=desmosParameters(data,511,{domain,includeCenter});
    for(let i=0;i<512;i+=7){
      const t=i/512*domain;
      const x=a.reduce((sum,v,n)=>sum+b[n]*Math.sin(k*(v+c[n]*t)),0);
      const y=a.reduce((sum,v,n)=>sum+b[n]*Math.cos(k*(v+c[n]*t)),0);
      const target={x:samples[i].x-(includeCenter?0:data.center.x),y:-samples[i].y+(includeCenter?0:data.center.y)};
      assert.ok(Math.hypot(x-target.x,y-target.y)<1e-10);
    }
  }
});

test('Desmos conversion preserves fractional and negative custom angular speeds',()=>{
  const data={center:{x:.3,y:-.2},terms:termsFromVectors([1.15,-2.3,0],[.2,-1.4,Math.PI/2],[.7,.2,.1])};
  const {a,b,c}=desmosParameters(data,3,{includeCenter:true});
  for(const t of [0,.123,.5,1]){
    const p=endpoint(data,3,t),k=200*Math.PI/180;
    const x=a.reduce((sum,v,i)=>sum+b[i]*Math.sin(k*(v+c[i]*t)),0),y=a.reduce((sum,v,i)=>sum+b[i]*Math.cos(k*(v+c[i]*t)),0);
    assert.ok(Math.hypot(x-p.x,y+p.y)<1e-12);
  }
});

test('Desmos lists avoid scientific e notation while preserving numeric values',()=>{
  const values=[1e-16,-2.5e-18,3.14159e21,0,-.123456,1.5e-7];
  const text=serializeDesmosList(values);
  assert.ok(!/[eE]/.test(text));
  assert.deepEqual(JSON.parse(text),values);
  assert.equal(serializeDesmosList([1e-16]),'[0.0000000000000001]');
});

test('uniform slowdown scales every Desmos speed, preserves a/b and extends the drawing interval',()=>{
  const data={center:{x:.3,y:-.2},terms:termsFromVectors([1.15,-2.3,0],[.2,-1.4,Math.PI/2],[.7,.2,.1])};
  for(const domain of [1,9]){
    const original=desmosParameters(data,3,{domain,includeCenter:true});
    for(const speedScale of [.1,.01,.08]){
      const slow=desmosParameters(data,3,{domain,includeCenter:true,speedScale});
      assert.deepEqual(slow.a,original.a);assert.deepEqual(slow.b,original.b);
      slow.c.forEach((speed,i)=>assert.equal(speed,original.c[i]*speedScale));
      assert.equal(slow.tMax,original.tMax/speedScale);
      for(const progress of [0,.123,.5,1]){
        const evaluate=(parameters,t)=>parameters.a.reduce((p,a,i)=>{const angle=200*Math.PI/180*(a+parameters.c[i]*t);return {x:p.x+parameters.b[i]*Math.sin(angle),y:p.y+parameters.b[i]*Math.cos(angle)};},{x:0,y:0});
        const first=evaluate(original,original.tMax*progress),second=evaluate(slow,slow.tMax*progress);
        assert.ok(Math.hypot(first.x-second.x,first.y-second.y)<1e-12);
      }
    }
  }
  for(const speedScale of [0,-1,NaN,Infinity])assert.throws(()=>desmosParameters(data,3,{speedScale}));
});
