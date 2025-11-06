import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Typography, Slider, FormControl, InputLabel, Select, MenuItem, FormControlLabel, Switch } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { Link, useLocation } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import dataUrl from "../maps/data.ini";

function parseIni(text) {
  const lines = (text || "").split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(";")) continue;
    const m = line.match(/^(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-F]+)\s*$/i);
    if (!m) continue;
    const [, idx, code, name, collector, kg, limit, x, y, dx, dy, serial] = m;
    out.push({
      idx: Number(idx), code, name: name.trim(), collector: Number(collector),
      kg: Number(kg), limit: Number(limit), x: Number(x), y: Number(y), dx: Number(dx), dy: Number(dy), serial
    });
  }
  return out;
}

function polyLength(pts) {
  let L = 0; for (let i=1;i<pts.length;i++){ const dx=pts[i][0]-pts[i-1][0]; const dy=pts[i][1]-pts[i-1][1]; L += Math.hypot(dx,dy);} return L;
}

function nearestOnPolyline(p, pts) {
  const [px,py] = p; let best={dist:Infinity, s:0}; let acc=0;
  for (let i=1;i<pts.length;i++){
    const x1=pts[i-1][0], y1=pts[i-1][1]; const x2=pts[i][0], y2=pts[i][1];
    const vx=x2-x1, vy=y2-y1; const len2=vx*vx+vy*vy; if (len2===0){acc+=0;continue;}
    let t=((px-x1)*vx + (py-y1)*vy)/len2; t=Math.max(0, Math.min(1,t));
    const qx=x1+t*vx, qy=y1+t*vy; const d=Math.hypot(px-qx, py-qy);
    if (d<best.dist){ best={dist:d, s: acc + Math.hypot(vx*t, vy*t)}; }
    acc += Math.sqrt(len2);
  }
  return best; // {dist, s}
}

// Merge long polylines by snapping endpoints within tolerance (greedy)
function mergeLongPolylines(polys, minLen=120, tol=6) {
  const longs = (polys||[]).filter(pl => polyLength(pl) >= minLen).map(pl => pl.slice());
  if (!longs.length) return [];
  // pick start: leftmost x
  let startIdx = 0; let minX = Infinity;
  longs.forEach((pl,i)=>{ const x = pl[0][0]; if (x < minX){ minX = x; startIdx = i; } });
  const used = new Array(longs.length).fill(false);
  let path = longs[startIdx].slice(); used[startIdx]=true;
  function close(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return (dx*dx+dy*dy) <= tol*tol; }
  while (true){
    let best = {i:-1, flip:false, d:Infinity};
    const end = path[path.length-1];
    for (let i=0;i<longs.length;i++){
      if (used[i]) continue; const pl=longs[i];
      if (close(end, pl[0])) { best={i, flip:false, d:0}; break; }
      if (close(end, pl[pl.length-1])) { best={i, flip:true, d:0}; break; }
    }
    if (best.i === -1) break;
    const add = longs[best.i];
    used[best.i]=true;
    if (best.flip) add.reverse();
    // avoid duplicate join point
    path = path.concat(add.slice(1));
  }
  return path;
}

// Ramer–Douglas–Peucker simplification for polyline
function rdp(points, epsilon) {
  if (!points || points.length < 3) return points || [];
  function distToSeg(p,a,b){
    const [x,y]=p,[x1,y1]=a,[x2,y2]=b; const A=x-x1, B=y-y1, C=x2-x1, D=y2-y1; const dot=A*C+B*D; const len2=C*C+D*D; const t=len2? Math.max(0, Math.min(1, dot/len2)) : 0; const dx=x1+t*C - x; const dy=y1+t*D - y; return Math.hypot(dx,dy);
  }
  function simplify(pts){
    let dmax=0, idx=0; const end=pts.length-1;
    for (let i=1;i<end;i++){ const d=distToSeg(pts[i], pts[0], pts[end]); if (d>dmax){ idx=i; dmax=d; } }
    if (dmax > epsilon){ const rec1=simplify(pts.slice(0, idx+1)); const rec2=simplify(pts.slice(idx)); return rec1.slice(0,-1).concat(rec2); }
    return [pts[0], pts[end]];
  }
  return simplify(points);
}

// Get point at normalized arc length along a polyline
function pointAtS(pts, sNorm){
  const total = polyLength(pts); if (total===0) return pts[0]||[0,0];
  const target = Math.max(0, Math.min(1, sNorm)) * total; let acc=0;
  for (let i=1;i<pts.length;i++){
    const p0=pts[i-1], p1=pts[i]; const seg=Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
    if (acc+seg >= target){ const t=(target-acc)/seg; return [p0[0]+t*(p1[0]-p0[0]), p0[1]+t*(p1[1]-p0[1])]; }
    acc += seg;
  }
  return pts[pts.length-1];
}

function PlanSvg({ plan, width=1024, height=600, strokeWidth=6, glow=false }){
  const colors = ["#e74c3c","#2ecc71","#40c4ff","#ffd740","#ab47bc","#ff9100","#69f0ae","#ff8a80","#82b1ff","#ffff00"];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{width:'100%', height:'auto'}}>
      <defs>
        <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {plan.lines.map((ln, idx)=>{
        const c = colors[idx % colors.length];
        const pathPts = ln.pathPts && ln.pathPts.length ? ln.pathPts : (ln.stations||[]).map(s=>[s.x,s.y]);
        const d = pathPts.map((p,i)=> `${i===0?'M':'L'} ${p[0]} ${p[1]}`).join(' ');
        return (
          <g key={idx} stroke={c} fill="none" filter={glow? 'url(#soft-glow)' : undefined}>
            <path d={d} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            {(ln.stations||[]).map((s,i)=> (
              <g key={i}>
                <circle cx={s.x} cy={s.y} r={strokeWidth*0.8} fill="#1e1f22" stroke={c} strokeWidth={3} />
                {s.label && <text x={s.x+10} y={s.y-10} fontSize={12} fill="#e0e0e0">{s.label}</text>}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function MapPlanPage(){
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mapKey = params.get('map') || 'map'; // default to original map

  const [raw, setRaw] = useState(null); // grouped lines JSON
  const [sensors, setSensors] = useState([]);
  const [sensorsSource, setSensorsSource] = useState('auto');
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [glow, setGlow] = useState(true);
  const [preserveShape, setPreserveShape] = useState(false);
  const [epsilon, setEpsilon] = useState(8);

  useEffect(()=>{
    let alive=true; const url = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.json`;
    fetch(url).then(r=>r.json()).then(j=>{ if(!alive) return; setRaw(j); }).catch(()=>{});
    return ()=>{ alive=false };
  },[mapKey]);

  useEffect(()=>{
    let alive=true;
    (async () => {
      try {
        // Prefer a map-specific .ini if present; otherwise only use default for base 'map'
        const specific = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.ini`;
        const r = await fetch(specific);
        if (r.ok) {
          const txt = await r.text();
          if (alive) { setSensors(parseIni(txt)); setSensorsSource(`${mapKey}.ini`); }
          return;
        }
        if (mapKey === 'map') {
          const r2 = await fetch(dataUrl);
          if (r2.ok) {
            const t = await r2.text();
            if (alive) { setSensors(parseIni(t)); setSensorsSource('data.ini'); }
          } else if (alive) { setSensors([]); setSensorsSource('none'); }
        } else if (alive) { setSensors([]); setSensorsSource('none'); }
      } catch (_e) {
        if (alive) { setSensors([]); setSensorsSource('none'); }
      }
    })();
    return ()=>{ alive=false };
  },[mapKey]);

  const plan = useMemo(()=>{
    if (!raw || !raw.groups) return { width: 1024, height: 600, lines: [] };
    // choose the main trunk for each group: longest polyline
    const trunks = raw.groups.map(g => {
      const polys = g.polylines||[]; let best=null, bestL=-1;
      for (const pl of polys){ const L=polyLength(pl); if (L>bestL){ bestL=L; best=pl; } }
      return { color: g.color || '#fff', poly: best||[] };
    });
    // map sensors to nearest trunk (only if a matching .ini is available or this is the base 'map')
    const mapped = trunks.map(()=> []);
    if (sensorsSource !== 'none') {
      for (const s of sensors){
        let best={gi:-1, dist:Infinity, s:0, L:1};
        trunks.forEach((t,gi)=>{
          if (!t.poly || t.poly.length<2) return; const m=nearestOnPolyline([s.x,s.y], t.poly); if (m.dist<best.dist){ best={gi, dist:m.dist, s:m.s, L:polyLength(t.poly)}; }
        });
        if (best.gi>=0 && best.dist <= 12){ // tighter tolerance to avoid mismatches
          mapped[best.gi].push({ sensor:s, pos: Math.max(0, Math.min(1, best.s / (best.L||1))) });
        }
      }
    }
    // If very few matched sensors total, ignore them and use geometric inference instead
    const matchedTotal = mapped.reduce((a,arr)=> a + arr.length, 0);
    // Fallback: if no sensors mapped, infer stations from fins (short polylines near trunk)
    raw.groups.forEach((g, gi) => {
      if ((mapped[gi]||[]).length > 0) return;
      const trunk = trunks[gi]; if (!trunk.poly || trunk.poly.length<2) return;
      const L = polyLength(trunk.poly);
      const fins = (g.polylines||[]).filter(pl => polyLength(pl) < 80); // short attachments
      const stations = [];
      fins.forEach(pl => {
        // use both endpoints
        const ends = [pl[0], pl[pl.length-1]];
        ends.forEach(p => {
          const m = nearestOnPolyline([p[0],p[1]], trunk.poly);
          if (m.dist <= 18){ stations.push({ pos: Math.max(0, Math.min(1, (m.s/(L||1)))) }); }
        });
      });
      // if still empty, sample evenly
      if (stations.length < 5){
        const n=12; for (let i=0;i<n;i++){ stations.push({ pos: (i/(n-1)) }); }
      }
      // push as pseudo sensors with generated labels
      stations.sort((a,b)=> a.pos - b.pos);
      stations.forEach((st, idx)=> mapped[gi].push({ sensor:{ code: `S${idx+1}`}, pos: st.pos }));
    });
    if (!preserveShape){
      // Horizontal lanes
      const gapX = 80; const gapY = 90; const left = 50; const top = 60;
      const lines = mapped.map((arr, gi)=>{
        const sorted = arr.sort((a,b)=> a.pos - b.pos);
        const y = top + gi*gapY;
        const stations = sorted.map((a,i)=> ({ x:left + i*gapX, y, label:a.sensor.code }));
        if (stations.length<2){ stations.push({x:left, y}); stations.push({x:left+gapX, y}); }
        return { stations };
      });
      const h = top + (lines.length? (lines.length-1)*gapY : 0) + 80;
      return { width: 1024, height: h, lines };
    }
    // Preserve shape: simplify trunks, compute bbox and transform
    const simpTrunks = raw.groups.map((g, gi) => {
      // try to merge long segments to better approximate the trunk
      const merged = mergeLongPolylines(g.polylines||[], 120, 6);
      const base = (merged && merged.length>1) ? merged : trunks[gi].poly;
      return { pts: rdp(base, epsilon) };
    });
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    simpTrunks.forEach(t=> (t.pts||[]).forEach(([x,y])=>{ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }));
    if (!isFinite(minX) || !isFinite(minY)) return { width:1024, height:600, lines:[] };
    const pad=40; const targetW=1024; const scale=(targetW-2*pad)/Math.max(1, maxX-minX); const targetH=(maxY-minY)*scale + 2*pad;
    const tx=(x)=> (x-minX)*scale + pad; const ty=(y)=> (y-minY)*scale + pad;
    const lines = simpTrunks.map((t, gi)=>{
      const sorted = (mapped[gi]||[]).sort((a,b)=> a.pos - b.pos);
      const stations = sorted.map(a => { const p=pointAtS(t.pts, a.pos); return { x:tx(p[0]), y:ty(p[1]), label:a.sensor.code }; });
      const pathPts = (t.pts||[]).map(p=>[tx(p[0]), ty(p[1])]);
      if (stations.length<2 && pathPts.length>=2){ stations.push({x:pathPts[0][0], y:pathPts[0][1]}); stations.push({x:pathPts[pathPts.length-1][0], y:pathPts[pathPts.length-1][1]}); }
      return { stations, pathPts };
    });
    return { width: targetW, height: targetH, lines };
  }, [raw, sensors, preserveShape, epsilon]);

  const drawerContent = (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Button component={Link} to="/" startIcon={<ArrowBackIosNewIcon/>} color="primary" variant="contained" fullWidth sx={{ textTransform:'none', fontWeight:700, boxShadow:'none' }}>Back to main</Button>
      </Box>
      <Typography variant="h6" sx={{ color:'#e0e0e0', mb:1 }}>Plan Controls</Typography>
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel id="map-select-label">Map source</InputLabel>
        <Select labelId="map-select-label" label="Map source" value={mapKey} onChange={()=>{ /* change via URL */ }}>
          <MenuItem value={mapKey}>{mapKey}</MenuItem>
        </Select>
      </FormControl>
      <Typography gutterBottom>Line stroke</Typography>
      <Slider min={3} max={12} step={1} value={strokeWidth} onChange={(_e,v)=> setStrokeWidth(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
      <FormControlLabel control={<Switch checked={glow} onChange={(e)=> setGlow(e.target.checked)} />} label="Glow" />
      <FormControlLabel control={<Switch checked={preserveShape} onChange={(e)=> setPreserveShape(e.target.checked)} />} label="Preserve map shape" />
      {preserveShape && (
        <>
          <Typography gutterBottom>Simplify epsilon</Typography>
          <Slider min={2} max={20} step={1} value={epsilon} onChange={(_e,v)=> setEpsilon(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
        </>
      )}
    </Box>
  );

  const mainContent = (
    <Box>
      <Typography variant="h5" sx={{ color:'#e7e7e7', mb:2 }}>Metro‑like Plan</Typography>
      <PlanSvg plan={plan} width={plan.width} height={plan.height} strokeWidth={strokeWidth} glow={glow} />
      <Typography variant="body2" sx={{ color:'#90a4ae', mt:2 }}>
        Tip: Switch map by changing the URL query, e.g. <code>?map=Deblin2a</code>.
      </Typography>
    </Box>
  );

  return <DashboardLayout drawerContent={drawerContent} mainContent={mainContent} />;
}
