import React, { useEffect, useMemo, useRef, useState } from "react";
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
      kp: Number(collector), // alias: KP id
      kg: Number(kg),        // original KG column
      aaa: Number(kg),       // alias requested (AAA column mapping to KG)
      limit: Number(limit), x: Number(x), y: Number(y), dx: Number(dx), dy: Number(dy), serial
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

// (removed old greedy merge; skeleton now built from multiple majors)

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

// Chaikin corner-cutting smoothing (single pass)
function chaikin(points) {
  if (!points || points.length < 3) return points || [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [x0,y0] = points[i-1];
    const [x1,y1] = points[i];
    const Q = [0.75*x0 + 0.25*x1, 0.75*y0 + 0.25*y1];
    const R = [0.25*x0 + 0.75*x1, 0.25*y0 + 0.75*y1];
    out.push(Q, R);
  }
  out.push(points[points.length-1]);
  return out;
}

// Greedy endpoint stitching: join segments whose endpoints are within distance
// and whose directions differ by less than angleDeg.
function stitchSegments(segments, distance=12, angleDeg=35){
  const segs = (segments||[]).map(pl => pl.slice());
  if (segs.length <= 1) return segs;
  const dist2 = (a,b)=>{ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; };
  const dirAt = (pl, atEnd)=>{
    if ((pl||[]).length<2) return [1,0];
    const n=pl.length; const a = atEnd? pl[n-2] : pl[1]; const b = atEnd? pl[n-1] : pl[0];
    const vx=b[0]-a[0], vy=b[1]-a[1]; const L=Math.hypot(vx,vy)||1; return [vx/L, vy/L];
  };
  function ang(u,v){ const dot=u[0]*v[0]+u[1]*v[1]; const c=Math.max(-1,Math.min(1,dot)); return Math.acos(c)*180/Math.PI; }
  const maxD2 = distance*distance; let merged=true; let guard=0;
  while (merged && guard++ < 2000){
    merged=false;
    outer: for (let i=0;i<segs.length;i++){
      for (let j=i+1;j<segs.length;j++){
        const A=segs[i], B=segs[j]; if (!A.length || !B.length) continue;
        const candidates=[
          {iEnd:true,  jEnd:false, a:A[A.length-1], b:B[0]},
          {iEnd:true,  jEnd:true,  a:A[A.length-1], b:B[B.length-1]},
          {iEnd:false, jEnd:false, a:A[0],           b:B[0]},
          {iEnd:false, jEnd:true,  a:A[0],           b:B[B.length-1]},
        ];
        for (const c of candidates){
          if (dist2(c.a,c.b) > maxD2) continue;
          const da = dirAt(A, c.iEnd);
          const db = dirAt(B, !c.jEnd); // direction into the join
          if (ang(da, db) > angleDeg) continue;
          // orient and join
          if (!c.iEnd) A.reverse();
          if (c.jEnd) B.reverse();
          // drop duplicate join point
          segs[i] = A.concat(B.slice(1));
          segs.splice(j,1);
          merged=true;
          break outer;
        }
      }
    }
  }
  return segs;
}

function PlanSvg({ plan, width=1024, height=600, strokeWidth=6, glow=false, showOverlay=false, overlayOpacity=0.25, svgRef, activeKg=null }){
  const colors = ["#e74c3c","#2ecc71","#40c4ff","#ffd740","#ab47bc","#ff9100","#69f0ae","#ff8a80","#82b1ff","#ffff00"];
  return (
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{width:'100%', height:'auto'}}>
      <defs>
        <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {showOverlay && (plan.overlayPaths||[]).map((paths, gi)=> (
        <g key={`ov-${gi}`} stroke="#607d8b" fill="none" opacity={overlayOpacity}>
          {paths.map((pl,pi)=>{
            const d = pl.map((p,i)=> `${i===0?'M':'L'} ${p[0]} ${p[1]}`).join(' ');
            return <path key={pi} d={d} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          })}
        </g>
      ))}
      {plan.lines.map((ln, idx)=>{
        const c = colors[idx % colors.length];
        const paths = ln.paths && ln.paths.length ? ln.paths : (ln.pathPts ? [ln.pathPts] : []);
        const dim = activeKg !== null ? !((ln.kgs||[]).includes(activeKg)) : false;
        return (
          <g key={idx} stroke={c} fill="none" filter={glow? 'url(#soft-glow)' : undefined} opacity={dim? 0.25 : 1}>
            {paths.map((pathPts, i2)=>{
              const d = pathPts.map((p,i)=> `${i===0?'M':'L'} ${p[0]} ${p[1]}`).join(' ');
              return <path key={i2} d={d} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            })}
            {(ln.stations||[]).map((s,i)=> (
              <g key={i} opacity={dim? 0.25 : 1}>
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

  const svgRef = useRef(null);
  const [raw, setRaw] = useState(null); // grouped lines JSON
  const [sensors, setSensors] = useState([]);
  const [sensorsSource, setSensorsSource] = useState('auto');
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [glow, setGlow] = useState(false);
  const [preserveShape, setPreserveShape] = useState(true);
  const [epsilon, setEpsilon] = useState(2);
  const [smoothPasses, setSmoothPasses] = useState(0); // 0–2 passes
  const [sensorTol, setSensorTol] = useState(12); // px tolerance for projecting sensors (mapping)
  const [trunkMinLen, setTrunkMinLen] = useState(0); // px: 0 = include all stitched segments
  const [stitchDist, setStitchDist] = useState(12);
  const [stitchAngle, setStitchAngle] = useState(35);
  const [snapStrength, setSnapStrength] = useState(100); // 0..100 (%), 100 = fully snap to path
  const [activeKg, setActiveKg] = useState(null); // null = all
  const [overlayBase, setOverlayBase] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.25);

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
    const groupKgVals = trunks.map(()=> new Set());
    if (sensorsSource !== 'none') {
      // Try to respect sensor line id (kg) by matching kg orders to group orders by vertical position
      const groupsY = trunks.map(t => {
        const pts=t.poly||[]; const m = pts.length? pts.reduce((a,p)=>a+p[1],0)/pts.length : 0; return m; });
      const groupOrder = groupsY.map((y,i)=>({i,y})).sort((a,b)=> a.y-b.y).map(o=>o.i); // 0=top
      const kgSet = Array.from(new Set(sensors.map(s=> s.kg).filter(k=> k!=null)));
      const kgY = kgSet.map(kg=>{
        const arr = sensors.filter(s=> s.kg===kg); const m = arr.length? arr.reduce((a,s)=>a+s.y,0)/arr.length : 0; return {kg, y:m};
      }).sort((a,b)=> a.y-b.y).map(o=>o.kg);
      const mapKgToGroup = new Map();
      const mlen = Math.min(groupOrder.length, kgY.length);
      for (let i=0;i<mlen;i++){ mapKgToGroup.set(kgY[i], groupOrder[i]); }

      for (const s of sensors){
        let targetGi = mapKgToGroup.has(s.kg) ? mapKgToGroup.get(s.kg) : -1;
        const search = (gi)=>{
          let best={gi:-1, dist:Infinity, s:0, L:1};
          const indices = gi>=0 ? [gi] : trunks.map((_t,idx)=>idx);
          for (const j of indices){ const t=trunks[j]; if (!t.poly||t.poly.length<2) continue; const m=nearestOnPolyline([s.x,s.y], t.poly); if (m.dist<best.dist){ best={gi:j, dist:m.dist, s:m.s, L:polyLength(t.poly)}; } }
          return best;
        };
        const best = search(targetGi);
        if (best.gi>=0){
          mapped[best.gi].push({ sensor:s, pos: Math.max(0, Math.min(1, best.s / (best.L||1))) });
          const kval = (s.aaa!=null ? s.aaa : s.kg);
          if (kval!=null) groupKgVals[best.gi].add(kval);
        }
      }
    }
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
          if (m.dist <= sensorTol){ stations.push({ pos: Math.max(0, Math.min(1, (m.s/(L||1)))) }); }
        });
      });
      // if still empty, sample evenly
      if (stations.length < 5){
        const n=20; for (let i=0;i<n;i++){ stations.push({ pos: (i/(n-1)) }); }
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
    // Preserve shape: build a skeleton of major legs per color as multiple paths
    const skeletons = raw.groups.map((g) => {
      // optional stitching to connect nearby fragments into continuous legs
      const stitched = stitchSegments(g.polylines||[], stitchDist, stitchAngle);
      const all = stitched.slice();
      let majors = trunkMinLen <= 0 ? all : all.filter(pl => polyLength(pl) >= trunkMinLen);
      // ensure at least some coverage: fallback to top longest segments
      if (majors.length === 0) {
        majors = all
          .map(pl => ({ pl, L: polyLength(pl) }))
          .sort((a,b)=> b.L - a.L)
          .slice(0, 6)
          .map(o => o.pl);
      }
      const merged = majors.map(pl => pl.slice());
      // simplify + smooth each major path
      const processed = merged.map(base => {
        let pts = rdp(base, epsilon);
        for (let i=0;i<Math.max(0, Math.min(3, smoothPasses)); i++) pts = chaikin(pts);
        return pts;
      });
      return processed; // array of paths
    });
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    skeletons.forEach(paths=> paths.forEach(pl=> pl.forEach(([x,y])=>{ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; })));
    if (!isFinite(minX) || !isFinite(minY)) return { width:1024, height:600, lines:[] };
    const pad=40; const targetW=1024; const scale=(targetW-2*pad)/Math.max(1, maxX-minX); const targetH=(maxY-minY)*scale + 2*pad;
    const tx=(x)=> (x-minX)*scale + pad; const ty=(y)=> (y-minY)*scale + pad;
    // Determine KG membership per group by nearest skeleton path (raw coordinates)
    const groupKgsBySkeleton = skeletons.map(()=> new Set());
    (sensors||[]).forEach(s => {
      const kval = (s.aaa!=null ? s.aaa : s.kg);
      if (kval==null) return;
      let bestGi = -1; let bestDist = Infinity;
      skeletons.forEach((paths, gi)=>{
        (paths||[]).forEach(pl => {
          if (!pl || pl.length<2) return;
          const m = nearestOnPolyline([s.x, s.y], pl);
          if (m.dist < bestDist){ bestDist = m.dist; bestGi = gi; }
        });
      });
      if (bestGi>=0) groupKgsBySkeleton[bestGi].add(kval);
    });
    const lines = skeletons.map((paths, gi)=>{
      // transform paths to view space
      const tpaths = paths.map(pl => pl.map(p=>[tx(p[0]), ty(p[1])]));
      // project stations to nearest path and place at that point
      const sorted = (mapped[gi]||[]).sort((a,b)=> a.pos - b.pos);
      const stations = sorted.map(a => {
        // Prefer raw sensor coordinates (INI), then snap toward nearest path if within sensorTol
        if (a.sensor && Number.isFinite(a.sensor.x) && Number.isFinite(a.sensor.y)){
          const raw = [tx(a.sensor.x), ty(a.sensor.y)];
          const best = projectToPaths(raw, tpaths);
          if (best.pathIndex>=0){
            const pl = tpaths[best.pathIndex];
            const p = pointAtS(pl, Math.max(0, Math.min(1, best.s / (best.L||1))));
            const alpha = Math.max(0, Math.min(1, (snapStrength||0)/100));
            const bx = raw[0]*(1-alpha) + p[0]*alpha;
            const by = raw[1]*(1-alpha) + p[1]*alpha;
            return { x:bx, y:by, label:a.sensor.code };
          }
          // fallback to raw
          return { x:raw[0], y:raw[1], label:a.sensor.code };
        }
        // Otherwise use the longest path and the normalized position
        const longest = tpaths.reduce((best,pl)=>{ const L=polyLength(pl); return (L>(best.L||-1))? {pl,L}: best; }, {pl:tpaths[0]||[], L:-1}).pl;
        const p = pointAtS(longest, Number.isFinite(a.pos)? a.pos : 0);
        return { x:p[0], y:p[1], label:a.sensor?.code };
      });
      if (!stations.length && tpaths.length && tpaths[0].length>=2){
        const a=tpaths[0][0], b=tpaths[0][tpaths[0].length-1];
        stations.push({x:a[0], y:a[1]}); stations.push({x:b[0], y:b[1]});
      }
      // collect KG labels for this group
      const kgs = Array.from(groupKgsBySkeleton[gi]||[]);
      const kgLabel = kgs.length ? kgs[0] : null;
      const lineName = raw.groups[gi]?.name || null;
      return { stations, paths: tpaths, kg: kgLabel, kgs, name: lineName };
    });
    // Also compute overlay paths from original extracted polylines
    const overlayPaths = raw.groups.map(g => (g.polylines||[]).map(pl => pl.map(p=>[tx(p[0]), ty(p[1])])));
    // buttons should reflect only KGs actually attached to some rendered line
    const kgList = Array.from(new Set(lines.flatMap(ln => (ln.kgs||[])))).filter(k=> k!=null).sort((a,b)=> a-b);
    return { width: targetW, height: targetH, lines, overlayPaths, kgList };
  }, [raw, sensors, preserveShape, epsilon, smoothPasses, sensorsSource, sensorTol, trunkMinLen, stitchDist, stitchAngle, snapStrength]);

  const [showAdvanced, setShowAdvanced] = useState(false);
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
      <Button onClick={()=>{
        try {
          const node = svgRef.current;
          if (!node) return;
          const xml = new XMLSerializer().serializeToString(node);
          const blob = new Blob([xml], {type:'image/svg+xml'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${mapKey}_plan.svg`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch(_e) {}
      }} variant="outlined" size="small" sx={{ mb:2 }}>Download SVG</Button>

      <Box sx={{ mb:2 }}>
        <Typography variant="body2" sx={{ color:'#9fb3c8', mb:1 }}>Focus line</Typography>
        <Box sx={{ display:'flex', flexWrap:'wrap', gap:1 }}>
          <Button size="small" variant={activeKg===null? 'contained':'outlined'} onClick={()=> setActiveKg(null)}>All</Button>
          {(plan.kgList && plan.kgList.length ? plan.kgList : []).map((k,idx)=> {
            const candidate = (plan.lines||[]).find(ln => (ln.kgs||[]).includes(k));
            const label = candidate?.name ? `${candidate.name} (KG ${k})` : `KG ${k}`;
            return (
              <Button key={idx} size="small" variant={activeKg===k? 'contained':'outlined'} onClick={()=> setActiveKg(k)}>
                {label.toUpperCase()}
              </Button>
            );
          })}
        </Box>
      </Box>

      <Button onClick={()=> setShowAdvanced(v=>!v)} size="small" sx={{ textTransform:'none' }}>
        {showAdvanced ? 'Hide advanced' : 'Show advanced'}
      </Button>

      {showAdvanced && (
        <Box sx={{ mt:1 }}>
          <Typography gutterBottom sx={{ color:'#9fb3c8' }}>Rendering</Typography>
          <Typography gutterBottom>Line stroke</Typography>
          <Slider min={3} max={12} step={1} value={strokeWidth} onChange={(_e,v)=> setStrokeWidth(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
          <FormControlLabel control={<Switch checked={glow} onChange={(e)=> setGlow(e.target.checked)} />} label="Glow" />
          <FormControlLabel control={<Switch checked={preserveShape} onChange={(e)=> setPreserveShape(e.target.checked)} />} label="Preserve map shape" />
          {preserveShape && (
            <>
              <Typography gutterBottom>Simplify epsilon</Typography>
              <Slider min={2} max={20} step={1} value={epsilon} onChange={(_e,v)=> setEpsilon(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <Typography gutterBottom>Smoothness (Chaikin passes)</Typography>
              <Slider min={0} max={2} step={1} value={smoothPasses} onChange={(_e,v)=> setSmoothPasses(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <Typography gutterBottom>Projection tolerance (px)</Typography>
              <Slider min={6} max={40} step={1} value={sensorTol} onChange={(_e,v)=> setSensorTol(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <Typography gutterBottom>Snap strength (%)</Typography>
              <Slider min={0} max={100} step={5} value={snapStrength} onChange={(_e,v)=> setSnapStrength(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <Typography gutterBottom>Trunk min length (px)</Typography>
              <Slider min={0} max={300} step={10} value={trunkMinLen} onChange={(_e,v)=> setTrunkMinLen(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <Typography gutterBottom>Stitch distance (px)</Typography>
              <Slider min={4} max={30} step={1} value={stitchDist} onChange={(_e,v)=> setStitchDist(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <Typography gutterBottom>Stitch angle (deg)</Typography>
              <Slider min={10} max={90} step={5} value={stitchAngle} onChange={(_e,v)=> setStitchAngle(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
              <FormControlLabel control={<Switch checked={overlayBase} onChange={(e)=> setOverlayBase(e.target.checked)} />} label="Overlay base map" />
              {overlayBase && (
                <>
                  <Typography gutterBottom>Overlay opacity</Typography>
                  <Slider min={0.05} max={0.8} step={0.05} value={overlayOpacity} onChange={(_e,v)=> setOverlayOpacity(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
                </>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );

  const mainContent = (
    <Box>
      <Typography variant="h5" sx={{ color:'#e7e7e7', mb:2 }}>Metro‑like Plan</Typography>
      <Typography variant="body2" sx={{ color:'#90a4ae', mb:2 }}>Sensor source: {sensorsSource}</Typography>
      <PlanSvg svgRef={svgRef} plan={plan} width={plan.width} height={plan.height} strokeWidth={strokeWidth} glow={glow} showOverlay={overlayBase} overlayOpacity={overlayOpacity} activeKg={activeKg} />
      <Typography variant="body2" sx={{ color:'#90a4ae', mt:2 }}>
        Tip: Switch map by changing the URL query, e.g. <code>?map=Deblin2a</code>.
      </Typography>
    </Box>
  );

  return <DashboardLayout drawerContent={drawerContent} mainContent={mainContent} />;
}
// Project a point to the nearest among multiple polylines
function projectToPaths(p, paths){
  let best = { pathIndex: -1, dist: Infinity, s: 0, L: 1 };
  paths.forEach((pl, idx)=>{
    if (!pl || pl.length < 2) return;
    const m = nearestOnPolyline(p, pl);
    if (m.dist < best.dist){ best = { pathIndex: idx, dist: m.dist, s: m.s, L: polyLength(pl) }; }
  });
  return best;
}
