export const TAU = Math.PI * 2;
export const DURATION = 9;
export const MAX_CIRCLES = 511;

// Desmos interprets JS-style 1e-16 as an expression with Euler's e, not a numeric literal.
export function serializeDesmosList(values) {
  return '[' + values.map(value => {
    if(!Number.isFinite(value))throw new Error('列表只能包含有限数字。');
    const text=String(value),[mantissa,exponent]=text.toLowerCase().split('e');
    if(exponent===undefined)return text;
    const sign=mantissa.startsWith('-')?'-':'',unsigned=mantissa.replace(/^[+-]/,''),digits=unsigned.replace('.','');
    const point=unsigned.split('.')[0].length+Number(exponent);
    if(point<=0)return sign+'0.'+'0'.repeat(-point)+digits;
    if(point>=digits.length)return sign+digits+'0'.repeat(point-digits.length);
    return sign+digits.slice(0,point)+'.'+digits.slice(point);
  }).join(', ') + ']';
}

// Match x=sum(b*sin(K*(a+c*t))), y=sum(b*cos(K*(a+c*t))), K=200*pi/180.
// Reflect canvas y into Cartesian y, and let Desmos t span either 1 or 9 units.
export function desmosParameters(data, count, {domain = 1, includeCenter = false, speedScale = 1} = {}) {
  if(!Number.isFinite(speedScale)||speedScale<=0)throw new Error('速度倍率必须大于 0。');
  const k = 200 * Math.PI / 180;
  const terms = data.terms.slice(0, count);
  const a = terms.map(term => (term.phase + Math.PI / 2) / k);
  const b = terms.map(term => term.amp);
  const c = terms.map(term => TAU * term.freq / (k * domain) * speedScale);
  if (includeCenter && Math.hypot(data.center.x, data.center.y) > 1e-15) {
    a.unshift(Math.atan2(data.center.x, -data.center.y) / k);
    b.unshift(Math.hypot(data.center.x, data.center.y));
    c.unshift(0);
  }
  return {a, b, c, tMax:domain/speedScale};
}

function normalizeMatrixText(text) {
  return text.trim().replaceAll('，',',').replaceAll('；',';').replaceAll('【','[').replaceAll('】',']').replaceAll('−','-');
}

export function serializeVector(values, shape = 'vector') {
  const numbers=values.map(n=>{if(!Number.isFinite(n))throw new Error('矩阵含有无效数字。');return n;});
  if(shape==='column')return '['+numbers.map(n=>'['+n+']').join(', ')+']';
  const vector='['+numbers.join(', ')+']';
  return shape==='row'?'['+vector+']':vector;
}

// Accept row/column vectors as JSON or MATLAB-style semicolon/newline vectors.
export function parseVector(text, label = '矩阵') {
  const value = normalizeMatrixText(text);
  if (!value) throw new Error(`${label}不能为空。`);
  let values;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    const vector=parsed.length===1 && Array.isArray(parsed[0]) ? parsed[0] : parsed;
    values = vector.map(item => Array.isArray(item) && item.length === 1 ? item[0] : item);
    if (values.some(item => typeof item !== 'number')) throw new Error();
  } catch {
    if (/\[.*\[/s.test(value) || !/^[\s\[\],;+.\deE-]+$/.test(value)) throw new Error(`${label}请使用数字组成的行向量或列向量。`);
    const inner = value.replace(/^\[/, '').replace(/\]$/, '').trim();
    if (/[\[\]]/.test(inner) || !inner) throw new Error(`${label}格式不正确。`);
    const parts = inner.split(/[\s,;]+/);
    if (parts.some(part => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part))) throw new Error(`${label}含有无效数字。`);
    values = parts.map(Number);
  }
  if (!values.length || values.length > MAX_CIRCLES) throw new Error(`${label}需要 1–${MAX_CIRCLES} 个数字。`);
  if (values.some(number => !Number.isFinite(number))) throw new Error(`${label}只能包含有限数字。`);
  return values;
}

export function termsFromVectors(omega, phase, radius) {
  if (omega.length !== phase.length || omega.length !== radius.length) throw new Error('三个矩阵的元素个数必须相同，每一行对应同一个圆。');
  if (!omega.length || omega.length > MAX_CIRCLES) throw new Error(`圆圈数量需要在 1–${MAX_CIRCLES} 之间。`);
  return omega.map((w, i) => {
    if (![w, phase[i], radius[i]].every(Number.isFinite)) throw new Error(`第 ${i+1} 个圆含有无效数字。`);
    if (Math.abs(w) > 1000) throw new Error(`第 ${i+1} 个圆的角速度须在 −1000 到 1000 rad/s 之间。`);
    if (Math.abs(phase[i]) > 1e6) throw new Error(`第 ${i+1} 个圆的角度绝对值不能大于 1000000 rad。`);
    if (radius[i] < 0 || radius[i] > 1000) throw new Error(`第 ${i+1} 个圆的半径须在 0 到 1000 之间。`);
    return {freq:w*DURATION/TAU, phase:phase[i], amp:radius[i], re:radius[i]*Math.cos(phase[i]), im:radius[i]*Math.sin(phase[i])};
  });
}

export function parseParameterTable(text) {
  const value = normalizeMatrixText(text);
  if (!value) throw new Error('请先粘贴参数表，每行依次为角速度、初始角度、半径。');
  let rows;
  try {
    const parsed=JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(row=>Array.isArray(row) && row.length===3 && row.every(n=>typeof n==='number'))) throw new Error();
    rows=parsed;
  } catch {
    if (/\[.*\[/s.test(value) || !/^[\s\[\],;+.\deE-]+$/.test(value)) throw new Error('整表请使用数字，每行三列；支持 Excel 表格或 [[角速度, 角度, 半径], ...]。');
    const inner=value.replace(/^\[/,'').replace(/\]$/,'').trim();
    rows=inner.split(/[;\r\n]+/).filter(row=>row.trim()).map((row,i)=>{
      const numbers=parseVector(row,`第 ${i+1} 行`);
      if(numbers.length!==3) throw new Error(`第 ${i+1} 行需要三列：角速度、初始角度、半径。`);
      return numbers;
    });
  }
  if(!rows.length) throw new Error('参数表不能为空。');
  const vectors=[0,1,2].map(col=>rows.map(row=>row[col]));
  termsFromVectors(...vectors);
  return vectors;
}

// Resample a closed stroke by arc length, so pointer speed does not affect the result.
export function resampleClosed(points, size = 512) {
  if (points.length < 2) throw new Error('请先画出一条线。');
  const pts = points.map(p => ({x: p.x, y: p.y}));
  pts.push({...pts[0]});
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = lengths.at(-1);
  if (total < 0.0001) throw new Error('图形太小，请再画大一些。');
  let j = 1;
  return Array.from({length: size}, (_, i) => {
    const distance = total * i / size;
    while (j < lengths.length - 1 && lengths[j] < distance) j++;
    const span = lengths[j] - lengths[j - 1];
    const a = span ? (distance - lengths[j - 1]) / span : 0;
    return {x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * a, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * a};
  });
}

export function transform(points) {
  const n = points.length;
  const coefficients = Array.from({length: n}, (_, k) => {
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) {
      const angle = TAU * k * j / n, c = Math.cos(angle), s = Math.sin(angle);
      re += points[j].x * c + points[j].y * s;
      im += points[j].y * c - points[j].x * s;
    }
    re /= n; im /= n;
    return {freq: k <= n / 2 ? k : k - n, re, im, amp: Math.hypot(re, im), phase: Math.atan2(im, re)};
  });
  return {center: {x: coefficients[0].re, y: coefficients[0].im}, terms: coefficients.slice(1).sort((a, b) => b.amp - a.amp)};
}

export function endpoint(data, count, time) {
  let x = data.center.x, y = data.center.y;
  for (const c of data.terms.slice(0, count)) {
    const angle = TAU * c.freq * time + c.phase;
    x += c.amp * Math.cos(angle); y += c.amp * Math.sin(angle);
  }
  return {x, y};
}

export function normalize(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = 2 / Math.max(maxX - minX, maxY - minY, 0.001);
  return points.map(p => ({x: (p.x - (minX + maxX) / 2) * scale, y: (p.y - (minY + maxY) / 2) * scale}));
}
