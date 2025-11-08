// Convert all frontend/public/maps/*.ini to UTF-8 using heuristic decoding
// Supports cp1250 and iso-8859-2 fallbacks for Polish diacritics
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const DIR = path.join(__dirname, '..', 'frontend', 'public', 'maps');

function decodeSmart(buf){
  // try utf8
  try {
    const t = buf.toString('utf8');
    if (!t.includes('\uFFFD')) return t;
  } catch(_) {}
  // try cp1250
  try {
    const t = iconv.decode(buf, 'windows-1250');
    if (!t.includes('\uFFFD')) return t;
  } catch(_) {}
  // try iso-8859-2
  try {
    const t = iconv.decode(buf, 'iso-8859-2');
    return t; // best-effort
  } catch(_) {}
  return buf.toString('utf8');
}

function convertDir(dir){
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.ini'));
  let changed = 0;
  for (const f of files){
    const p = path.join(dir, f);
    const buf = fs.readFileSync(p);
    const txt = decodeSmart(buf);
    // simple heuristic: if writing back changes the byte length or removes mojibake sequences
    const utf8 = Buffer.from(txt, 'utf8');
    if (!utf8.equals(buf)){
      fs.writeFileSync(p, utf8);
      console.log('Converted to UTF-8:', f);
      changed++;
    }
  }
  if (!changed) console.log('No INI files needed conversion.');
}

if (fs.existsSync(DIR)) convertDir(DIR);
else console.error('Directory not found:', DIR);

