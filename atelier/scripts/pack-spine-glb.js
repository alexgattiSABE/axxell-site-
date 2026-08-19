/* Ricomprime assets/spine.glb dal modello sorgente.
 *
 * Il file che arriva da trimesh ha gli indici a 32 bit, ma la mesh ha 33.658
 * vertici: ci stanno in 16 bit con un terzo del posto libero. Riscriverli a
 * uint16 toglie 400 KB su 1,2 MB senza perdere un vertice. Le posizioni
 * restano float32.
 *
 *   node scripts/pack-spine-glb.js <sorgente.glb> assets/spine.glb
 */
const fs = require('fs');

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('uso: node pack-spine-glb.js <in.glb> <out.glb>'); process.exit(1); }

const buf = fs.readFileSync(src);
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('non è un GLB');

// --- lettura dei due chunk (JSON + BIN) ---
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.toString('utf8', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'JSON') json = JSON.parse(data.toString('utf8'));
  else if (type.charCodeAt(0) === 0x42) bin = data;   // 'BIN\0'
  off += 8 + len + ((4 - (len % 4)) % 4);
}
const prim = json.meshes[0].primitives[0];
if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1)
  throw new Error('atteso un solo mesh con una sola primitive');

const COMP = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
function read(i) {
  const acc = json.accessors[i], bv = json.bufferViews[acc.bufferView];
  const Ctor = COMP[acc.componentType];
  const n = acc.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 })[acc.type];
  return new Ctor(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0), n);
}

const pos = read(prim.attributes.POSITION);
const idx = read(prim.indices);
const vcount = pos.length / 3;
if (vcount > 65535) throw new Error('troppi vertici per gli indici a 16 bit: ' + vcount);

const idx16 = Uint16Array.from(idx);
const posB = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
const idxB = Buffer.from(idx16.buffer, idx16.byteOffset, idx16.byteLength);
const pad = b => (b.length % 4) ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b;
const idxP = pad(idxB);
const binOut = Buffer.concat([idxP, posB]);

// bounding box: gli accessor di POSITION devono avere min/max, e il loader li usa
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i += 3)
  for (let k = 0; k < 3; k++) {
    if (pos[i + k] < min[k]) min[k] = pos[i + k];
    if (pos[i + k] > max[k]) max[k] = pos[i + k];
  }

const jsonOut = {
  asset: { version: '2.0', generator: 'axxell pack-spine-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'spine' }],
  meshes: [{ name: 'spine', primitives: [{ attributes: { POSITION: 1 }, indices: 0, mode: 4 }] }],
  accessors: [
    { bufferView: 0, componentType: 5123, count: idx16.length, type: 'SCALAR' },
    { bufferView: 1, componentType: 5126, count: vcount, type: 'VEC3', min, max }
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: idxB.length, target: 34963 },
    { buffer: 0, byteOffset: idxP.length, byteLength: posB.length, target: 34962 }
  ],
  buffers: [{ byteLength: binOut.length }]
};

let jsonB = Buffer.from(JSON.stringify(jsonOut), 'utf8');
while (jsonB.length % 4) jsonB = Buffer.concat([jsonB, Buffer.from(' ')]);

const chunk = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.write(t, 4, 'ascii'); return Buffer.concat([h, b]); };
const c0 = chunk(jsonB, 'JSON'), c1 = chunk(binOut, 'BIN\0');
const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + c0.length + c1.length, 8);
fs.writeFileSync(out, Buffer.concat([head, c0, c1]));

console.log(vcount + ' vertici, ' + (idx16.length / 3) + ' triangoli');
console.log('bbox  x ' + min[0].toFixed(3) + '..' + max[0].toFixed(3) +
            '  y ' + min[1].toFixed(3) + '..' + max[1].toFixed(3) +
            '  z ' + min[2].toFixed(3) + '..' + max[2].toFixed(3));
console.log((buf.length / 1024).toFixed(0) + ' KB -> ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
