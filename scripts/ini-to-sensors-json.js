// Convert INI-like sensor description files in frontend/public/maps to JSON
// Outputs <name>.sensors.json next to each .ini
// Handles headers: [Name], LINIA: Name, and lines like `KPn KGm` overriding kp/kg for subsequent rows

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const MAPS_DIR = path.join(__dirname, '..', 'frontend', 'public', 'maps');

function decodeSmart(buf){
  try { const t = buf.toString('utf8'); if (!t.includes('\uFFFD')) return t; } catch(_) {}
  try { const t = iconv.decode(buf, 'windows-1250'); if (!t.includes('\uFFFD')) return t; } catch(_) {}
  try { const t = iconv.decode(buf, 'iso-8859-2'); return t; } catch(_) {}
  return buf.toString('utf8');
}

function parseIniText(text){
  const out = [];
  let currentLineName = null;
  let currentHeaderKP = null;
  let currentHeaderKG = null;
  for (const raw of text.split(/\r?\n/)){
    const line = raw.trimEnd();
    if (!line || line.startsWith(';')) continue;
    // Headers
    const startsWithDigit = /^\s*\d/.test(line);
    let mHeader = line.match(/^\s*\[(.+?)\]\s*$/) || line.match(/^\s*(?:LINIA|LINIE|LINE)[:\s-]+(.+?)\s*$/i) || null;
    if (!startsWithDigit && mHeader){ currentLineName = mHeader[1].trim(); currentHeaderKP=null; currentHeaderKG=null; continue; }
    const mKP = line.match(/^\s*KP\s*([0-9]+)\s*KG\s*([0-9]+)\s*$/i);
    if (!startsWithDigit && mKP){ currentHeaderKP = Number(mKP[1]); currentHeaderKG = Number(mKP[2]); currentLineName = `KP${currentHeaderKP} KG${currentHeaderKG}`; continue; }

    // Records (allow variable spacing). Extended trailing fields optional.
    // Variant A: index + CODE + name + numbers
    const m = line.match(/^\s*(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-Fa-f]+)\s*$/);
    const mExt = !m ? line.match(/^\s*(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-Fa-f]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ]+)\s+(\d+)\s+(\d+)\s*$/i) : null;
    // Variant B: index + name + numbers (no explicit code token)
    const mB = (!m && !mExt) ? line.match(/^\s*(\d+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-Fa-f]+)\s*$/) : null;
    const mBExt = (!m && !mExt && !mB) ? line.match(/^\s*(\d+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-Fa-f]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ]+)\s+(\d+)\s+(\d+)\s*$/i) : null;
    if (!m && !mExt && !mB && !mBExt) continue;
    const hasCode = !!(m || mExt);
    const arr = m || mExt || mB || mBExt;
    let idx, code, name, collector, kg, limit, x, y, dx, dy, serial, typ, codeId, colorId;
    if (hasCode){
      [, idx, code, name, collector, kg, limit, x, y, dx, dy, serial] = arr;
      typ = (mExt ? arr[12] : undefined);
      codeId = (mExt ? Number(arr[13]) : undefined);
      colorId = (mExt ? Number(arr[14]) : undefined);
    } else {
      [, idx, name, collector, kg, limit, x, y, dx, dy, serial] = arr;
      typ = (mBExt ? arr[11] : undefined);
      codeId = (mBExt ? Number(arr[12]) : undefined);
      colorId = (mBExt ? Number(arr[13]) : undefined);
      code = `S${idx}`;
    }
    const kpNum = Number(collector);
    const kgNum = (currentHeaderKG != null) ? Number(currentHeaderKG) : Number(kg);
    out.push({
      idx: Number(idx),
      code,
      name: String(name).trim(),
      collector: Number(collector),
      kp: (currentHeaderKP != null ? Number(currentHeaderKP) : kpNum),
      kg: kgNum,
      aaa: Number(kg),
      limit: Number(limit),
      x: Number(x), y: Number(y), dx: Number(dx), dy: Number(dy),
      serial: String(serial).toUpperCase(),
      type: typ, codeId, colorId,
      line: currentLineName || null,
    });
  }
  return out;
}

function convertIniFile(p){
  const base = path.basename(p, path.extname(p));
  const outPath = path.join(path.dirname(p), `${base}.sensors.json`);
  const buf = fs.readFileSync(p);
  const txt = decodeSmart(buf);
  const sensors = parseIniText(txt);
  fs.writeFileSync(outPath, JSON.stringify({ source: path.basename(p), count: sensors.length, sensors }, null, 2), 'utf8');
  console.log('Generated', path.basename(outPath), '(', sensors.length, 'records )');
}

function run(){
  if (!fs.existsSync(MAPS_DIR)) { console.error('Not found:', MAPS_DIR); process.exit(1); }
  const files = fs.readdirSync(MAPS_DIR).filter(f => f.toLowerCase().endsWith('.ini'));
  if (!files.length) { console.log('No .ini files found in', MAPS_DIR); return; }
  for (const f of files) convertIniFile(path.join(MAPS_DIR, f));
}

run();
