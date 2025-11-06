import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Typography, Slider, FormControl, InputLabel, Select, MenuItem, Stack, FormControlLabel, Switch } from "@mui/material";
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
        const d = ln.stations.map((s,i)=> `${i===0?'M':'L'} ${s.x} ${s.y}`).join(' ');
        return (
          <g key={idx} stroke={c} fill="none" filter={glow? 'url(#soft-glow)' : undefined}>
            <path d={d} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            {ln.stations.map((s,i)=> (
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
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [glow, setGlow] = useState(true);

  useEffect(()=>{
    let alive=true; const url = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.json`;
    fetch(url).then(r=>r.json()).then(j=>{ if(!alive) return; setRaw(j); }).catch(()=>{});
    return ()=>{ alive=false };
  },[mapKey]);

  useEffect(()=>{
    let alive=true; fetch(dataUrl).then(r=>r.text()).then(t=>{ if(!alive) return; setSensors(parseIni(t));}).catch(()=>{});
    return ()=>{ alive=false };
  },[]);

  const plan = useMemo(()=>{
    if (!raw || !raw.groups) return { width: 1024, height: 600, lines: [] };
    // choose the main trunk for each group: longest polyline
    const trunks = raw.groups.map(g => {
      const polys = g.polylines||[]; let best=null, bestL=-1;
      for (const pl of polys){ const L=polyLength(pl); if (L>bestL){ bestL=L; best=pl; } }
      return { color: g.color || '#fff', poly: best||[] };
    });
    // map sensors to nearest trunk
    const mapped = trunks.map(()=> []);
    for (const s of sensors){
      let best={gi:-1, dist:Infinity, s:0, L:1};
      trunks.forEach((t,gi)=>{
        if (!t.poly || t.poly.length<2) return; const m=nearestOnPolyline([s.x,s.y], t.poly); if (m.dist<best.dist){ best={gi, dist:m.dist, s:m.s, L:polyLength(t.poly)}; }
      });
      if (best.gi>=0 && best.dist <= 30){ // tolerance
        mapped[best.gi].push({ sensor:s, pos: Math.max(0, Math.min(1, best.s / (best.L||1))) });
      }
    }
    // build plan lines: lay stations horizontally by arc order
    const gapX = 80; const gapY = 90; const left = 50; const top = 60;
    const lines = mapped.map((arr, gi)=>{
      const sorted = arr.sort((a,b)=> a.pos - b.pos);
      const y = top + gi*gapY;
      const n = Math.max(sorted.length, 2);
      const width = (n-1) * gapX;
      const stations = sorted.map((a,i)=> ({ x:left + i*gapX, y, label:a.sensor.code }));
      // ensure we always draw something even if no sensors matched
      if (stations.length<2){ stations.push({x:left, y}); stations.push({x:left+gapX, y}); }
      return { stations };
    });
    const h = top + (lines.length? (lines.length-1)*gapY : 0) + 80;
    return { width: 1024, height: h, lines };
  }, [raw, sensors]);

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

