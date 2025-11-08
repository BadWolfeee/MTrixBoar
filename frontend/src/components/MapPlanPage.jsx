import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Typography, Slider, FormControl, InputLabel, Select, MenuItem, FormControlLabel, Switch, Dialog } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { Link, useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import dataUrl from "../maps/data.ini";
import catalog from "../maps/catalog.json";

// Decode helper: try UTF-8, then Windows-1250, then ISO-8859-2
async function fetchTextSmart(url){
  const r = await fetch(url);
  if (!r.ok) throw new Error("fetch failed");
  const buf = await r.arrayBuffer();
  const decUtf8 = new TextDecoder("utf-8", { fatal: false });
  let txt = decUtf8.decode(buf);
  if (txt.includes("\uFFFD")) { // replacement char present → try legacy encodings
    try {
      const dec1250 = new TextDecoder("windows-1250", { fatal: false });
      const t2 = dec1250.decode(buf);
      // Prefer the variant with fewer replacement chars
      const bad1 = (txt.match(/\uFFFD/g)||[]).length; const bad2 = (t2.match(/\uFFFD/g)||[]).length;
      if (bad2 < bad1) txt = t2;
    } catch(_) {}
    if (txt.includes("\uFFFD")){
      try {
        const decIso = new TextDecoder("iso-8859-2", { fatal: false });
        const t3 = decIso.decode(buf);
        const bad1 = (txt.match(/\uFFFD/g)||[]).length; const bad3 = (t3.match(/\uFFFD/g)||[]).length;
        if (bad3 < bad1) txt = t3;
      } catch(_) {}
    }
  }
  return txt;
}

function parseIni(text) {
  const lines = (text || "").split(/\r?\n/);
  const out = [];
  let currentLineName = null; // header like [Linia X] / LINIA: X / KPn KGm
  let currentHeaderKP = null;
  let currentHeaderKG = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(";")) continue;
    // Optional header markers to tag following sensors with line/route name
    let mHeader = line.match(/^\s*\[(.+?)\]\s*$/) || line.match(/^\s*(?:LINIA|LINIE|LINE)[:\s-]+(.+?)\s*$/i) || null;
    if (!/^\s*\d/.test(line) && mHeader) { currentLineName = mHeader[1].trim(); currentHeaderKP=null; currentHeaderKG=null; continue; }
    const mKP = line.match(/^\s*KP\s*([0-9]+)\s*KG\s*([0-9]+)\s*$/i);
    if (!/^\s*\d/.test(line) && mKP) { currentHeaderKP = Number(mKP[1]); currentHeaderKG = Number(mKP[2]); currentLineName = `KP${currentHeaderKP} KG${currentHeaderKG}`; continue; }
    const m = line.match(/^\s*(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-F]+)\s*$/i);
    // Extended form with trailing measurement/type + code/color ids
    const mExt = !m ? line.match(/^\s*(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+([0-9A-F]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ]+)\s+(\d+)\s+(\d+)\s*$/i) : null;
    if (!m && !mExt) continue;
    const arr = (m||mExt);
    const [, idx, code, name, collector, kg, limit, x, y, dx, dy, serial] = arr;
    const typ = mExt ? arr[12] : undefined;
    const codeId = mExt ? Number(arr[13]) : undefined;
    const colorId = mExt ? Number(arr[14]) : undefined;
    // Allow block headers like `KP2 KG4` to override row KG/KP when source files use block semantics
    const kpNum = Number(collector);
    const kgNum = (currentHeaderKG != null) ? Number(currentHeaderKG) : Number(kg);
    out.push({
      idx: Number(idx), code, name: name.trim(), collector: Number(collector),
      kp: (currentHeaderKP != null ? Number(currentHeaderKP) : kpNum), // alias: KP id
      kg: kgNum,        // KG (overridden by header if present)
      aaa: Number(kg),       // alias requested (AAA column mapping to KG)
      limit: Number(limit), x: Number(x), y: Number(y), dx: Number(dx), dy: Number(dy), serial,
      type: typ, codeId, colorId,
      line: currentLineName || null,
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

function PlanSvg({ plan, width=1024, height=600, strokeWidth=6, glow=false, showOverlay=false, overlayOpacity=0.25, svgRef, activePairKey=null, activeGroupIndex=null, labelBaseDist=18, labelRings=4, inlineLabels=false, overrideViewBox=null, onPointerMove=null, suppressHover=false }){
  const [hover, setHover] = React.useState(null); // {x,y,label,groupName,code}
  const [hoverData, setHoverData] = React.useState({ loading:false, value:null, time:null, placeholder:false });
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(()=>{
    try{
      if (svgRef && svgRef.current){
        const rect = svgRef.current.getBoundingClientRect();
        if (rect && rect.width){ setScale(Math.max(0.8, Math.min(1.6, rect.width / width))); }
      }
    }catch(_e){}
  }, [svgRef, width, height, plan]);

  // Fetch latest sample for hovered sensor (only for demo sensors 1/2/3 to avoid heavy queries)
  React.useEffect(()=>{
    let alive = true;
    async function load(){
      try{
        if (!hover || !hover.code) { if (alive) setHoverData({ loading:false, value:null, time:null, placeholder:false }); return; }
        const code = String(hover.code || '').toUpperCase();
        const m = code.match(/^SZ\s*([0-9]+)$/);
        const n = m ? m[1] : String(hover.label||'');
        if (!['1','2','3'].includes(n)) { if (alive) setHoverData({ loading:false, value:null, time:null, placeholder:true }); return; }
        const now = new Date();
        const start = new Date(now.getTime() - 7*24*3600*1000).toISOString();
        const end = now.toISOString();
        const name = `SZ${n}`;
        if (alive) setHoverData({ loading:true, value:null, time:null, placeholder:false });
        const url = `/api/sensor-data/filtered?sensor_type=${encodeURIComponent(name)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
        const r = await fetch(url);
        if (!r.ok) { if (alive) setHoverData({ loading:false, value:null, time:null, placeholder:true }); return; }
        const arr = await r.json();
        // pick the newest by mt_time
        let latest = null;
        for (const it of arr){ if (it.mt_time && (!latest || new Date(it.mt_time) > new Date(latest.mt_time))) latest = it; }
        if (alive){
          if (latest){ setHoverData({ loading:false, value: latest.mt_value, time: latest.mt_time, placeholder:false }); }
          else { setHoverData({ loading:false, value:null, time:null, placeholder:true }); }
        }
      }catch(_e){ if (alive) setHoverData({ loading:false, value:null, time:null, placeholder:true }); }
    }
    // small debounce
    const t = setTimeout(load, 120);
    return ()=>{ alive=false; clearTimeout(t); };
  }, [hover]);
  const fallback = ["#e74c3c","#2ecc71","#40c4ff","#ffd740","#ab47bc","#ff9100","#69f0ae","#ff8a80","#82b1ff","#ffff00"];
  // Improved label layout: place along polyline normal, avoid overlaps and keep clearance from paths
  const layoutLabels = (lines)=>{
    const placed = [];
    const rects = [];
    const approx = (text)=> ({ w: Math.max(18, 7 * String(text||'').length), h: 12 });
    const overlapsRect = (r)=> rects.some(q=> !(r.x+r.w < q.x || q.x+q.w < r.x || r.y+r.h < q.y || q.y+q.h < r.y));
    const pointRadius = Math.max(6, strokeWidth*0.8 + 2);
    // distance from a point to a polyline
    const distToPath = (p, paths)=>{
      let best = Infinity;
      for (const pl of (paths||[])){
        for (let i=1;i<pl.length;i++){
          const a = pl[i-1], b = pl[i];
          const vx=b[0]-a[0], vy=b[1]-a[1];
          const len2 = vx*vx+vy*vy; if (!len2) continue;
          let t = ((p.x-a[0])*vx + (p.y-a[1])*vy)/len2; t = Math.max(0, Math.min(1, t));
          const qx=a[0]+t*vx, qy=a[1]+t*vy;
          const d = Math.hypot(p.x-qx, p.y-qy);
          if (d < best) best = d;
        }
      }
      return best;
    };
    const nearestNormal = (p, paths)=>{
      let best = { d: Infinity, nx: 0, ny: -1 };
      for (const pl of (paths||[])){
        for (let i=1;i<pl.length;i++){
          const a = pl[i-1], b = pl[i];
          const vx=b[0]-a[0], vy=b[1]-a[1];
          const len2 = vx*vx+vy*vy; if (!len2) continue;
          let t = ((p.x-a[0])*vx + (p.y-a[1])*vy)/len2; t = Math.max(0, Math.min(1, t));
          const qx=a[0]+t*vx, qy=a[1]+t*vy;
          const d = Math.hypot(p.x-qx, p.y-qy);
          if (d < best.d){
            const L = Math.hypot(vx,vy) || 1;
            const tx=vx/L, ty=vy/L; // tangent
            best = { d, nx: -ty, ny: tx };
          }
        }
      }
      return best; // unit normal (approx)
    };
    // Collect all stations with group index and paths for group
    const allStations = [];
    lines.forEach((ln, gi)=> (ln.stations||[]).forEach(s=> allStations.push({ ...s, gi })) );
    // Precompute per-group paths
    const groupPaths = (lines||[]).map(ln => ln.paths || []);
    // Also build all-paths for global clearance
    const allPaths = [].concat(...groupPaths);
    // Compute simple centroid per group for outward bias
    const groupCentroids = groupPaths.map(paths => {
      let sx=0, sy=0, cnt=0;
      for (const pl of (paths||[])) { for (const p of pl){ sx += p[0]; sy += p[1]; cnt++; } }
      return cnt ? { x: sx/cnt, y: sy/cnt } : { x: 0, y: 0 };
    });
    const minPathClear = 12; // px
    for (const s of allStations){
      const size = approx(s.label);
      const paths = groupPaths[s.gi] || [];
      // Preferred from INI dx,dy
      const direct = (Number.isFinite(s.lx) && Number.isFinite(s.ly)) ? [{ x: s.lx, y: s.ly }] : [];
      // Candidates along polyline normal, both sides, increasing radius (keep near-constant distance)
      const n = nearestNormal({x:s.x,y:s.y}, paths);
      // Bias normal to point away from the group centroid ("outside")
      const cen = groupCentroids[s.gi] || {x:0,y:0};
      const vx = s.x - cen.x, vy = s.y - cen.y;
      let pref = { nx: n.nx, ny: n.ny };
      if (pref.nx*vx + pref.ny*vy < 0) pref = { nx: -pref.nx, ny: -pref.ny };
      const normals = [ pref, { nx: -pref.nx, ny: -pref.ny } ];
      const rings = Math.max(1, Math.min(6, Number(labelRings)||4));
      const b = Math.max(10, Number(labelBaseDist)||18);
      const radii = Array.from({length:rings}, (_,i)=> b + i*8);
      const angleSweep = [ -35, 0, 35 ];
      const deg2rad = (a)=> a*Math.PI/180;
      const cand = [...direct];
      normals.forEach(N=>{
        radii.forEach(R=>{
          angleSweep.forEach(a=>{
            const ca=Math.cos(deg2rad(a)), sa=Math.sin(deg2rad(a));
            const rx = N.nx*ca - N.ny*sa; const ry = N.nx*sa + N.ny*ca;
            cand.push({ x: s.x + R*rx, y: s.y + R*ry });
          });
        });
      });
      // Fallback radial candidates
      for (let r=b; r<=b+8*(rings-1); r+=8){
        for (let ang=0; ang<360; ang+=45){
          const a = deg2rad(ang);
          cand.push({ x: s.x + r*Math.cos(a), y: s.y + r*Math.sin(a) });
        }
      }
      let chosen=null;
      for (const c of cand){
        const r = { x: c.x, y: c.y - size.h, w: size.w, h: size.h };
        // keep a small gap from point itself
        const cx = r.x + r.w/2, cy = r.y + r.h/2;
        const dPoint = Math.hypot(cx - s.x, cy - s.y);
        if (dPoint < pointRadius + 6) continue;
        // clearance from group paths
        const dPath = Math.min(distToPath({x:cx,y:cy}, paths), distToPath({x:cx,y:cy}, allPaths));
        if (dPath < minPathClear) continue;
        // no overlap with previously placed labels
        if (overlapsRect(r)) continue;
        chosen = { lx: c.x, ly: c.y, r }; break;
      }
      if (!chosen){
        const c = { x: s.x + 16, y: s.y - 16 };
        chosen = { lx: c.x, ly: c.y, r: { x: c.x, y: c.y - size.h, w: size.w, h: size.h } };
      }
      rects.push(chosen.r);
      placed.push({ ...s, lx: chosen.lx, ly: chosen.ly });
    }
    return placed;
  };
  const labelsPlaced = inlineLabels ? [] : layoutLabels(plan.lines||[]);

  // When inline labels are enabled, slightly repel overlapping nodes along local normal
  function adjustInlineNodes(lines){
    const groups = (lines||[]).map((ln)=>{
      const stations = (ln.stations||[]).map(s=> ({...s}));
      const paths = ln.paths || [];
      // helper: nearest normal for a point against group's paths
      const nearestNormal = (p)=>{
        let best = { d: Infinity, nx: 0, ny: -1 };
        for (const pl of (paths||[])){
          for (let i=1;i<pl.length;i++){
            const a=pl[i-1], b=pl[i];
            const vx=b[0]-a[0], vy=b[1]-a[1];
            const len2=vx*vx+vy*vy; if(!len2) continue;
            let t=((p.x-a[0])*vx + (p.y-a[1])*vy)/len2; t=Math.max(0, Math.min(1,t));
            const qx=a[0]+t*vx, qy=a[1]+t*vy;
            const d=Math.hypot(p.x-qx, p.y-qy);
            if (d<best.d){ const L=Math.hypot(vx,vy)||1; best={ d, nx:-vy/L, ny:vx/L } }
          }
        }
        return best;
      };

      const r = Math.max(8, strokeWidth*0.95) * scale;
      const minD = 2*r + 4; // min separation between nodes
      const step = 2; const maxShift = 12;
      // Greedy pass: compare with earlier placed, nudge along normal if too close
      for (let i=0;i<stations.length;i++){
        const s = stations[i];
        let px=s.x, py=s.y; let shift=0; const n=nearestNormal({x:px,y:py});
        let tries=0;
        while (tries++<30){
          let collided=false;
          for (let j=0;j<i;j++){
            const t = stations[j];
            const d = Math.hypot(px - t.x, py - t.y);
            if (d < minD){ collided=true; break; }
          }
          if (!collided) break;
          // alternate direction to avoid stacking, but keep small total shift
          const dir = (i%2===0? 1 : -1);
          px += dir * n.nx * step; py += dir * n.ny * step; shift += step;
          if (shift >= maxShift) break;
        }
        s.x = px; s.y = py;
      }
      // Second pass: mild relaxation among close pairs
      for (let iter=0; iter<2; iter++){
        for (let i=0;i<stations.length;i++){
          for (let j=i+1;j<stations.length;j++){
            const a = stations[i], b = stations[j];
            const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx,dy);
            if (d > minD) continue;
            const ux = (d>0? dx/d : 1), uy=(d>0? dy/d : 0);
            const push = (minD - d)/2;
            a.x -= ux*push; a.y -= uy*push;
            b.x += ux*push; b.y += uy*push;
          }
        }
      }
      return stations;
    });
    return groups;
  }
  return (
    <svg ref={svgRef} width={width} height={height} viewBox={overrideViewBox || `0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{width:'100%', height:'100%'}}
         onMouseMove={(e)=>{
           if (!onPointerMove) return;
           try{
             const svg = svgRef?.current;
             if (!svg || !svg.getScreenCTM) return;
             const pt = svg.createSVGPoint();
             pt.x = e.clientX; pt.y = e.clientY;
             const m = svg.getScreenCTM();
             if (!m) return;
             const inv = m.inverse();
             const sp = pt.matrixTransform(inv);
             onPointerMove({ x: sp.x, y: sp.y, clientX: e.clientX, clientY: e.clientY });
           }catch(_e){}
         }}>
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
        const c = (plan.groupColors && plan.groupColors[idx]) || fallback[idx % fallback.length];
        const paths = ln.paths && ln.paths.length ? ln.paths : (ln.pathPts ? [ln.pathPts] : []);
        const inlineStations = inlineLabels ? adjustInlineNodes([{ stations: ln.stations, paths }])[0] : null;
        // If we have a KG→group mapping, dim by that; otherwise fall back to membership
        const mappedGroup = plan.pairMap && activePairKey ? plan.pairMap[activePairKey] : undefined;
        const dimKg = activePairKey !== null ? (mappedGroup!=null ? (idx !== mappedGroup) : false) : false;
        const dimGroup = activeGroupIndex !== null ? (idx !== activeGroupIndex) : false;
        const dim = dimKg || dimGroup;
        return (
          <g key={idx} stroke={c} fill="none" filter={glow? 'url(#soft-glow)' : undefined} opacity={dim? 0.25 : 1}>
            {paths.map((pathPts, i2)=>{
              const d = pathPts.map((p,i)=> `${i===0?'M':'L'} ${p[0]} ${p[1]}`).join(' ');
              return <path key={i2} d={d} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            })}
            {(ln.stations||[]).map((s,i)=> {
              const sDraw = inlineLabels && inlineStations ? inlineStations[i] : s;
              const placed = inlineLabels ? sDraw : (labelsPlaced.find(p => p.gi===idx && p.x===s.x && p.y===s.y && p.label===s.label) || s);
              const hoverX = inlineLabels ? sDraw.x : (placed.lx || (s.x+10));
              const hoverY = inlineLabels ? sDraw.y - 18 : ((placed.ly || (s.y-10)) - 14);
              const r = (inlineLabels ? Math.max(8, strokeWidth*0.95) : Math.max(6, strokeWidth*0.8)) * scale;
              return (
                <g key={i} opacity={dim? 0.25 : 1}
                   onMouseEnter={()=> setHover({ x: hoverX, y: hoverY, sx: (inlineLabels ? sDraw.x : s.x), sy: (inlineLabels ? sDraw.y : s.y), label: s.label, code: s.code, groupName: (plan.lines?.[idx]?.name)||`#${idx+1}` })}
                   onMouseLeave={()=> setHover(null)}>
                  <circle cx={inlineLabels ? sDraw.x : s.x} cy={inlineLabels ? sDraw.y : s.y} r={r} fill="#1e1f22" stroke={c} strokeWidth={3} />
                  {inlineLabels ? (
                    s.label && <text x={sDraw.x} y={sDraw.y} fontSize={10*scale} fontWeight={700} fontFamily="'Roboto','Segoe UI',Arial,sans-serif" fill="#e0e0e0" stroke="#1e1f22" strokeWidth={2} paintOrder="stroke" textAnchor="middle" dominantBaseline="middle">{s.label}</text>
                  ) : (
                    placed.label && (
                      <>
                        <line x1={s.x} y1={s.y} x2={placed.lx || (s.x+10)} y2={placed.ly || (s.y-10)} stroke={c} strokeWidth={1} opacity={0.7} />
                        <text x={placed.lx || (s.x+10)} y={placed.ly || (s.y-10)} fontSize={12*scale} fontWeight={700} fontFamily="'Roboto','Segoe UI',Arial,sans-serif" fill="#e0e0e0" stroke="#1e1f22" strokeWidth={3} paintOrder="stroke">{placed.label}</text>
                      </>
                    )
                  )}
                  {/* click to navigate to sensor details */}
                  <title>{s.code || s.label}</title>
                </g>
              );
            })}
          </g>
        );
      })}
      {!suppressHover && hover && (
        <g pointerEvents="none">
          <rect x={hover.x-70} y={hover.y-38} width={200} height={40} rx={6} ry={6} fill="#263238" stroke="#90a4ae" strokeWidth={1}/>
          <text x={hover.x-64} y={hover.y-22} fontSize={12} fill="#e0e0e0">
            {(hover.code||hover.label)} • {(hover.groupName||'')}
          </text>
          <text x={hover.x-64} y={hover.y-8} fontSize={12} fill="#b0bec5">
            {hoverData.loading ? 'Loading…' : (hoverData.placeholder ? 'No data' : `Latest: ${hoverData.value ?? '-'} @ ${hoverData.time ? new Date(hoverData.time).toLocaleString() : '-'}`)}
          </text>
        </g>
      )}
    </svg>
  );
}

export default function MapPlanPage(){
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const mapKey = params.get('map') || 'map'; // default to original map

  const svgRef = useRef(null);
  const [raw, setRaw] = useState(null); // grouped lines JSON
  const [sensors, setSensors] = useState([]);
  const [sensorsSource, setSensorsSource] = useState('auto');
  const [manualPairMap, setManualPairMap] = useState(null); // optional { pairs: { "kp|kg": "groupName" } }
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
  const [activePairKey, setActivePairKey] = useState(null); // null = all, format "kp|kg"
  const [overlayBase, setOverlayBase] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.25);
  const [focusGroup, setFocusGroup] = useState(null); // null = all groups
  const [showDiag, setShowDiag] = useState(false);
  const [respectIniOffsets, setRespectIniOffsets] = useState(false);
  const [useIdxLabels, setUseIdxLabels] = useState(true); // show sensor idx instead of code
  const [labelBaseDist, setLabelBaseDist] = useState(18); // px
  const [labelRings, setLabelRings] = useState(4); // attempts
  const [inlineLabels, setInlineLabels] = useState(true); // render label inside node
  const [zoomOpen, setZoomOpen] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  const [lensPos, setLensPos] = useState({x:0,y:0});
  const [lensSize, setLensSize] = useState(260);
  const [lensScale, setLensScale] = useState(10.0);

  useEffect(()=>{
    let alive=true; const url = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.json`;
    fetch(url).then(r=>r.json()).then(j=>{ if(!alive) return; setRaw(j); }).catch(()=>{});
    return ()=>{ alive=false };
  },[mapKey]);

  // Try load optional manual pair map: <map>.pairmap.json
  useEffect(()=>{
    let alive=true;
    (async () => {
      try {
        const pmUrl = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.pairmap.json`;
        const r = await fetch(pmUrl);
        if (r.ok){ const j = await r.json(); if (alive) setManualPairMap(j); else return; }
        else if (alive) setManualPairMap(null);
      } catch(_e){ if (alive) setManualPairMap(null); }
    })();
    return ()=>{ alive=false };
  }, [mapKey]);

  useEffect(()=>{
    let alive=true;
    (async () => {
      try {
        // Prefer a map-specific .ini if present; otherwise only use default for base 'map'
        // 1) Try JSON sensors first (generated from INI)
        const jsonSensors = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.sensors.json`;
        try {
          const rj = await fetch(jsonSensors);
          if (rj.ok) {
            const js = await rj.json();
            if (alive) { setSensors(js.sensors || []); setSensorsSource(`${mapKey}.sensors.json`); }
            return;
          }
        } catch(_) {}
        // 2) Fallback to raw INI
        const specific = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.ini`;
        try {
          const txt = await fetchTextSmart(specific);
          if (alive) { setSensors(parseIni(txt)); setSensorsSource(`${mapKey}.ini`); }
          return;
        } catch(_e) {}
        if (mapKey === 'map') {
          try {
            const t = await fetchTextSmart(dataUrl);
            if (alive) { setSensors(parseIni(t)); setSensorsSource('data.ini'); }
          } catch(_e) { if (alive) { setSensors([]); setSensorsSource('none'); } }
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
    const labelOf = (sensor)=> (useIdxLabels && Number.isFinite(sensor?.idx)) ? String(sensor.idx) : (sensor?.code ?? '');
    const groupKgVals = trunks.map(()=> new Set());
    const dbgKgCounts = new Map(); // kg -> count
    const dbgKgVotes = new Map();  // kg -> Map(groupIdx -> count)
    const dbgColorCounts = new Map(); // colorId -> count
    const dbgColorVotes = new Map();  // colorId -> Map(groupIdx -> count)
    const dbgPairVotes = new Map();   // 'kp|kg' -> Map(groupIdx -> count)
    let colorToGroup = new Map();
    let kgToGroup = new Map();
    const assignedKgVotes = new Map(); // kg -> Map(groupIdx->count) for final assigned placements
    const placementReasons = { pairmap:0, color:0, kg:0, nearest:0 };
    const unplacedSensors = [];
    const placements = [];

    if (sensorsSource !== 'none') {
      // Pass 1: for each sensor, find nearest group (independent of KG/color) for voting
      const nearest = (s) => {
        let bestGi=-1, bestDist=Infinity, bestS=0, bestL=1;
        trunks.forEach((t, gi)=>{
          if (!t.poly || t.poly.length<2) return;
          const m = nearestOnPolyline([s.x, s.y], t.poly);
          if (m.dist < bestDist){ bestDist=m.dist; bestGi=gi; bestS=m.s; bestL=polyLength(t.poly)||1; }
        });
        return {gi:bestGi, s:bestS, L:bestL};
      };
      const nearestInfo = sensors.map(s => ({ s, n: nearest(s) }));

      // Build votes: colorId -> group, KG -> group (by majority of nearest)
      nearestInfo.forEach(({s, n})=>{
        if (s.kg!=null){ dbgKgCounts.set(s.kg, (dbgKgCounts.get(s.kg)||0)+1); if (!dbgKgVotes.has(s.kg)) dbgKgVotes.set(s.kg, new Map()); const mv=dbgKgVotes.get(s.kg); if (n.gi>=0) mv.set(n.gi, (mv.get(n.gi)||0)+1); }
        if (Number.isFinite(s.colorId)){ dbgColorCounts.set(s.colorId, (dbgColorCounts.get(s.colorId)||0)+1); if (!dbgColorVotes.has(s.colorId)) dbgColorVotes.set(s.colorId, new Map()); const mv=dbgColorVotes.get(s.colorId); if (n.gi>=0) mv.set(n.gi, (mv.get(n.gi)||0)+1); }
        if (s.kp!=null && s.kg!=null){ const key=`${s.kp}|${s.kg}`; if (!dbgPairVotes.has(key)) dbgPairVotes.set(key, new Map()); const mv=dbgPairVotes.get(key); if (n.gi>=0) mv.set(n.gi, (mv.get(n.gi)||0)+1); }
      });
      colorToGroup = new Map();
      dbgColorVotes.forEach((m, cid)=>{ let bestGi=-1, bestCnt=0; m.forEach((cnt,gi)=>{ if(cnt>bestCnt){ bestCnt=cnt; bestGi=gi; } }); if (bestGi>=0) colorToGroup.set(cid, bestGi); });

      // Robust KG→group mapping by median distance across sensors in the KG (use trunks to avoid order deps)
      const byKg = new Map();
      nearestInfo.forEach(({s, n})=>{ if (s.kg!=null){ if (!byKg.has(s.kg)) byKg.set(s.kg, []); byKg.get(s.kg).push(s); } });
      const median = (arr)=>{ if (!arr.length) return Infinity; const a = arr.slice().sort((x,y)=>x-y); const mid=Math.floor(a.length/2); return (a.length%2)? a[mid] : (0.5*(a[mid-1]+a[mid])); };
      kgToGroup = new Map();
      byKg.forEach((arr, kg)=>{
        let bestGi=-1, bestMed=Infinity;
        for (let gi=0; gi<trunks.length; gi++){
          const t = trunks[gi];
          if (!t.poly || t.poly.length < 2) continue;
          const dists = arr.map(s=>{
            const m = nearestOnPolyline([s.x, s.y], t.poly);
            return m.dist;
          }).filter(d=> isFinite(d));
          const med = median(dists);
          if (med < bestMed){ bestMed = med; bestGi = gi; }
        }
        if (bestGi>=0) kgToGroup.set(kg, bestGi);
      });

      // Majority mapping for pair (KP,KG) -> group with manual overrides
      const pairToGroup = new Map();
      // Manual overrides from <map>.pairmap.json (by name or color label or numeric index)
      if (manualPairMap && manualPairMap.pairs){
        const canon = (s)=> String(s||"").trim().toLowerCase();
        const palette = [
          { label: 'red',   hex: '#e74c3c' },
          { label: 'green', hex: '#2ecc71' },
          { label: 'blue',  hex: '#40c4ff' },
          { label: 'orange',hex: '#ffd740' },
        ];
        const hexToRgb = (h)=>{ const x=h.replace('#',''); return { r:parseInt(x.slice(0,2),16), g:parseInt(x.slice(2,4),16), b:parseInt(x.slice(4,6),16) }; };
        const dist2 = (a,b)=>{ const da=a.r-b.r, db=a.g-b.g, dc=a.b-b.b; return da*da+db*db+dc*dc; };
        const groupColorLabel = (g)=>{
          const c = String(g.color||'').toLowerCase();
          if (/^#([0-9a-f]{6})$/.test(c)){
            const rgb = hexToRgb(c);
            let best='red', bestD=Infinity; for (const p of palette){ const d=dist2(rgb, hexToRgb(p.hex)); if (d<bestD){ bestD=d; best=p.label; } }
            return best;
          }
          return canon(g.name||'');
        };
        const labelToIndex = new Map();
        (raw.groups||[]).forEach((g,i)=>{ labelToIndex.set(canon(g.name||''), i); labelToIndex.set(groupColorLabel(g), i); });
        Object.entries(manualPairMap.pairs).forEach(([key, val])=>{
          const v = canon(val);
          let gi = undefined;
          if (labelToIndex.has(v)) gi = labelToIndex.get(v);
          else if (!isNaN(Number(v))) gi = Number(v);
          if (gi!=null && isFinite(gi)) pairToGroup.set(key, gi);
        });
      }
      // Fill remaining pairs from votes
      dbgPairVotes.forEach((m, key)=>{ if (pairToGroup.has(key)) return; let bestGi=-1, bestCnt=0; m.forEach((cnt,gi)=>{ if (cnt>bestCnt){ bestCnt=cnt; bestGi=gi; } }); if (bestGi>=0) pairToGroup.set(key, bestGi); });

      // Pass 2: assign sensors with priority: colorId → KG → nearest
      nearestInfo.forEach(({s, n})=>{
        let gi = -1; let reason = 'nearest';
        const pkey = (s.kp!=null && s.kg!=null) ? `${s.kp}|${s.kg}` : null;
        if (pkey && pairToGroup.has(pkey)) { gi = pairToGroup.get(pkey); reason='pairmap'; }
        else if (Number.isFinite(s.colorId) && colorToGroup.has(s.colorId)) { gi = colorToGroup.get(s.colorId); reason='color'; }
        else if (s.kg!=null && kgToGroup.has(s.kg)) { gi = kgToGroup.get(s.kg); reason='kg'; }
        else { gi = n.gi; reason='nearest'; }
        if (gi>=0){
          placementReasons[reason] = (placementReasons[reason]||0)+1;
          const pos = Math.max(0, Math.min(1, n.s / (n.L||1)));
          mapped[gi].push({ sensor:s, pos });
          placements.push({ code:s.code, name:s.name, kp:s.kp, kg:s.kg, group: gi, groupName: (raw.groups?.[gi]?.name)||`#${gi+1}` });
          const kval = (s.aaa!=null ? s.aaa : s.kg);
          if (kval!=null) groupKgVals[gi].add(kval);
          if (s.kg!=null){
            if (!assignedKgVotes.has(s.kg)) assignedKgVotes.set(s.kg, new Map());
            const mv = assignedKgVotes.get(s.kg);
            mv.set(gi, (mv.get(gi)||0)+1);
          }
        } else {
          const why = (!Number.isFinite(s.x) || !Number.isFinite(s.y)) ? 'missing_coords' : 'no_nearest_line';
          unplacedSensors.push({ code: s.code, name: s.name, kp: s.kp, kg: s.kg, x: s.x, y: s.y, reason: why });
        }
      });
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
    const groupNamesBySensors = skeletons.map(()=> new Map()); // name -> count
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
      if (bestGi>=0) {
        groupKgsBySkeleton[bestGi].add(kval);
        if (s.line) {
          const m = groupNamesBySensors[bestGi];
          m.set(s.line, (m.get(s.line)||0)+1);
        }
      }
    });
    let lines = skeletons.map((paths, gi)=>{
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
            // Preferred label position from INI dx,dy if present (transformed)
            let lx = null, ly = null;
            if (respectIniOffsets && Number.isFinite(a.sensor.dx) && Number.isFinite(a.sensor.dy)){
              lx = tx(a.sensor.x + a.sensor.dx);
              ly = ty(a.sensor.y + a.sensor.dy);
            }
            return { x:bx, y:by, label:labelOf(a.sensor), code:a.sensor.code, kp:a.sensor.kp, kg:a.sensor.kg, lx, ly };
          }
          // fallback to raw
          let lx = null, ly = null;
          if (respectIniOffsets && Number.isFinite(a.sensor.dx) && Number.isFinite(a.sensor.dy)){
            lx = tx(a.sensor.x + a.sensor.dx);
            ly = ty(a.sensor.y + a.sensor.dy);
          }
          return { x:raw[0], y:raw[1], label:labelOf(a.sensor), code:a.sensor.code, kp:a.sensor.kp, kg:a.sensor.kg, lx, ly };
        }
        // Otherwise use the longest path and the normalized position
        const longest = tpaths.reduce((best,pl)=>{ const L=polyLength(pl); return (L>(best.L||-1))? {pl,L}: best; }, {pl:tpaths[0]||[], L:-1}).pl;
        const p = pointAtS(longest, Number.isFinite(a.pos)? a.pos : 0);
        return { x:p[0], y:p[1], label:labelOf(a.sensor), code:a.sensor?.code, kp:a.sensor?.kp, kg:a.sensor?.kg };
      });
      if (!stations.length && tpaths.length && tpaths[0].length>=2){
        const a=tpaths[0][0], b=tpaths[0][tpaths[0].length-1];
        stations.push({x:a[0], y:a[1]}); stations.push({x:b[0], y:b[1]});
      }
      // collect KG labels for this group
      const kgs = Array.from(groupKgsBySkeleton[gi]||[]);
      const kgLabel = kgs.length ? kgs[0] : null;
      // Prefer explicit group name from JSON; else majority sensor line name
      let lineName = raw.groups[gi]?.name || null;
      if (!lineName) {
        const m = groupNamesBySensors[gi];
        let bestName=null, bestCnt=0; m.forEach((cnt,name)=>{ if(cnt>bestCnt){ bestCnt=cnt; bestName=name; }});
        if (bestName) lineName = bestName;
      }
      return { stations, paths: tpaths, kg: kgLabel, kgs, name: lineName };
    });
    // Also compute overlay paths from original extracted polylines
    const overlayPaths = raw.groups.map(g => (g.polylines||[]).map(pl => pl.map(p=>[tx(p[0]), ty(p[1])])));
    // Fallback: if no lines produced (edge cases), render overlay as lines
    const totalPaths = lines.reduce((s,ln)=> s + ((ln.paths||[]).length), 0);
    if (!totalPaths) {
      lines = overlayPaths.map((paths, gi)=> ({ stations: [], paths, kgs: [], name: raw.groups[gi]?.name || null }));
    }
    // buttons should reflect only KGs actually attached to some rendered line
    // Majority KP per KG for labeling
    const dbgKpByKg = new Map();
    (sensors||[]).forEach(s=>{ if (s.kg!=null && s.kp!=null){ if (!dbgKpByKg.has(s.kg)) dbgKpByKg.set(s.kg, new Map()); const m=dbgKpByKg.get(s.kg); m.set(s.kp, (m.get(s.kp)||0)+1); } });
    const kgToKp = new Map(); dbgKpByKg.forEach((m,kg)=>{ let best=null,bCnt=0; m.forEach((cnt,kp)=>{ if(cnt>bCnt){ bCnt=cnt; best=kp; } }); if (best!=null) kgToKp.set(kg, best); });

    // Use majority mapping for KG list and filtering
    // Build pair list and mapping for UI
    const nameToGroup = new Map((raw.groups||[]).map((g,i)=> [String(g.name||`#${i+1}`).toLowerCase(), i]));
    let pairList = Array.from(dbgPairVotes.keys()).map(k=>{ const [kp,kg] = k.split('|').map(Number); return { key:k, kp, kg }; }).sort((a,b)=> (a.kp-b.kp)|| (a.kg-b.kg));
    const pairMap = {};
    // 1) manual overrides if present
    if (manualPairMap && manualPairMap.pairs){
      Object.entries(manualPairMap.pairs).forEach(([key, gName])=>{
        const gi = nameToGroup.has(String(gName).toLowerCase()) ? nameToGroup.get(String(gName).toLowerCase()) : undefined;
        if (gi!=null){ pairMap[key]=gi; }
      });
      // ensure pairList includes manual keys
      const manualKeys = Object.keys(manualPairMap.pairs);
      const merged = new Map(pairList.map(p=> [p.key, p]));
      manualKeys.forEach(k=>{ if (!merged.has(k)){ const [kp,kg] = k.split('|').map(Number); merged.set(k, { key:k, kp, kg }); }});
      pairList = Array.from(merged.values()).sort((a,b)=> (a.kp-b.kp)|| (a.kg-b.kg));
    }
    // 2) fill gaps from votes
    dbgPairVotes.forEach((_,key)=>{ if (pairMap[key]!=null) return; const gi = (new Map([...dbgPairVotes.get(key).entries()])).size ? (function(){ let bestGi=-1, bestCnt=0; dbgPairVotes.get(key).forEach((cnt,gi)=>{ if(cnt>bestCnt){ bestCnt=cnt; bestGi=gi; } }); return bestGi; })() : -1; if (gi>=0) pairMap[key]=gi; });
    const kgList = Array.from(new Set([ ...Array.from(dbgKgVotes.keys()) ])).filter(k=> k!=null).sort((a,b)=> a-b);
    const kgMap = {}; kgToGroup.forEach((gi,kg)=>{ kgMap[kg]=gi; });

    // Build diagnostics structures
    // Use final assigned placements for KG stats (reflects pairmap and rules)
    const kgStats = Array.from(assignedKgVotes.entries()).map(([kg, m])=>{
      let bestGi=-1, bestCnt=0; m.forEach((cnt,gi)=>{ if(cnt>bestCnt){ bestCnt=cnt; bestGi=gi; } });
      const count = Array.from(m.values()).reduce((a,b)=>a+b,0);
      return { kg, count, group: bestGi, groupName: (bestGi>=0 && lines[bestGi]?.name) ? lines[bestGi].name : null };
    }).sort((a,b)=> a.kg - b.kg);
    const colorStats = Array.from(dbgColorCounts.entries()).map(([cid, count])=>{
      const votes = dbgColorVotes.get(cid) || new Map();
      let bestGi=-1, bestCnt=0; votes.forEach((cnt,gi)=>{ if(cnt>bestCnt){ bestCnt=cnt; bestGi=gi; } });
      return { colorId: cid, count, group: bestGi, groupName: (bestGi>=0 && lines[bestGi]?.name) ? lines[bestGi].name : null };
    }).sort((a,b)=> a.colorId - b.colorId);
    // Pair coverage and placements payload
    const pairStatsMap = new Map();
    placements.forEach(p=>{ const key=`${p.kp||''}|${p.kg||''}`; const m = pairStatsMap.get(key) || { key, kp:p.kp, kg:p.kg, counts:new Map(), total:0 }; m.total++; m.counts.set(p.group, (m.counts.get(p.group)||0)+1); pairStatsMap.set(key, m); });
    const pairStats = Array.from(pairStatsMap.values()).map(m=>{ let bestGi=-1, bestCnt=0; m.counts.forEach((cnt,gi)=>{ if(cnt>bestCnt){ bestCnt=cnt; bestGi=gi; } }); return { key:m.key, kp:m.kp, kg:m.kg, total:m.total, group: bestGi, groupName: (bestGi>=0 && raw.groups?.[bestGi]?.name)||null }; }).sort((a,b)=> (a.kp-b.kp)|| (a.kg-b.kg));
    const debug = { sensorCount: (sensors||[]).length, kgStats, colorStats, groupCount: (raw.groups||[]).length, unplaced: unplacedSensors.slice(0, 50), reasonCounts: placementReasons, unplacedTotal: unplacedSensors.length, pairStats, placements };
    const groupColors = (raw.groups||[]).map((g,i)=> g.color || ["#e74c3c","#2ecc71","#40c4ff","#ffd740"][i%4]);
    return { width: targetW, height: targetH, lines, overlayPaths, kgList, kgMap, kgToKp, pairList, pairMap, groupColors, debug };
  }, [raw, sensors, preserveShape, epsilon, smoothPasses, sensorsSource, sensorTol, trunkMinLen, stitchDist, stitchAngle, snapStrength, manualPairMap, respectIniOffsets, useIdxLabels]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const drawerContent = (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Button component={Link} to="/" startIcon={<ArrowBackIosNewIcon/>} color="primary" variant="contained" fullWidth sx={{ textTransform:'none', fontWeight:700, boxShadow:'none' }}>Back to main</Button>
      </Box>
      <Typography variant="h6" sx={{ color:'#e0e0e0', mb:1 }}>Plan Controls</Typography>
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel id="map-select-label">Map source</InputLabel>
        <Select labelId="map-select-label" label="Map source" value={mapKey}
          onChange={(e)=>{
            const key = e.target.value;
            const search = new URLSearchParams(location.search);
            search.set('map', key);
            navigate({ pathname: location.pathname, search: `?${search.toString()}` });
          }}>
          {(catalog.maps||[]).map(m => (
            <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
          ))}
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
      <Button onClick={()=> setLensOn(v=> !v)} variant="contained" size="small" sx={{ mb:2, ml:1, textTransform:'none' }}>{lensOn? 'Close lens' : 'Zoom lens'}</Button>

      <Button onClick={()=>{
        try {
          const rows = (plan?.debug?.placements||[]);
          const header = 'code,name,kp,kg,group,groupName\n';
          const body = rows.map(r=> [r.code||'', (r.name||'').replaceAll('"','""'), r.kp??'', r.kg??'', r.group??'', r.groupName||''].map(v=> typeof v==='string'? `"${v}"` : v).join(',')).join('\n');
          const csv = header + body;
          const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href=url; a.download=`${mapKey}_placements.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch(_e) {}
      }} variant="outlined" size="small" sx={{ mb:2, ml:1 }}>Download placements CSV</Button>

      <Box sx={{ mb:2 }}>
        <Typography variant="body2" sx={{ color:'#9fb3c8', mb:1 }}>Focus line</Typography>
        <Box sx={{ display:'flex', flexWrap:'wrap', gap:1 }}>
          <Button size="small" variant={activePairKey===null? 'contained':'outlined'} onClick={()=> setActivePairKey(null)}>ALL</Button>
          {(plan.pairList && plan.pairList.length ? plan.pairList : []).map((p)=> {
            const key = `${p.kp}|${p.kg}`;
            const label = `KP${p.kp} KG ${p.kg}`;
            return (
              <Button key={key} size="small" variant={activePairKey===key? 'contained':'outlined'} onClick={()=> setActivePairKey(key)}>
                {label.toUpperCase()}
              </Button>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ mb:2 }}>
        <Typography variant="body2" sx={{ color:'#9fb3c8', mb:1 }}>Focus by color line</Typography>
        <Box sx={{ display:'flex', flexWrap:'wrap', gap:1 }}>
          <Button size="small" variant={focusGroup===null? 'contained':'outlined'} onClick={()=> setFocusGroup(null)}>ALL</Button>
          {(raw?.groups||[]).map((g, gi)=> (
            <Button key={gi} size="small" variant={focusGroup===gi? 'contained':'outlined'} onClick={()=> setFocusGroup(gi)}>
              {(g.name || `#${gi+1}`).toUpperCase()}
            </Button>
          ))}
        </Box>
      </Box>

      <Button onClick={()=> setShowAdvanced(v=>!v)} size="small" sx={{ textTransform:'none' }}>
        {showAdvanced ? 'Hide advanced' : 'Show advanced'}
      </Button>

      <Button onClick={()=> setShowDiag(v=>!v)} size="small" sx={{ textTransform:'none', ml:1 }}>
        {showDiag ? 'Hide diagnostics' : 'Show diagnostics'}
      </Button>

      {showAdvanced && (
        <Box sx={{ mt:1 }}>
          <Typography gutterBottom sx={{ color:'#9fb3c8' }}>Rendering</Typography>
          <Typography gutterBottom>Line stroke</Typography>
          <Slider min={3} max={12} step={1} value={strokeWidth} onChange={(_e,v)=> setStrokeWidth(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
          <FormControlLabel control={<Switch checked={glow} onChange={(e)=> setGlow(e.target.checked)} />} label="Glow" />
          <FormControlLabel control={<Switch checked={preserveShape} onChange={(e)=> setPreserveShape(e.target.checked)} />} label="Preserve map shape" />
          <FormControlLabel control={<Switch checked={respectIniOffsets} onChange={(e)=> setRespectIniOffsets(e.target.checked)} />} label="Use INI label offsets (dx,dy)" />
          <FormControlLabel control={<Switch checked={useIdxLabels} onChange={(e)=> setUseIdxLabels(e.target.checked)} />} label="Use index as label" />
          <FormControlLabel control={<Switch checked={inlineLabels} onChange={(e)=> setInlineLabels(e.target.checked)} />} label="Inline labels (inside nodes)" />
          <Typography gutterBottom>Lens size</Typography>
          <Slider min={140} max={360} step={10} value={lensSize} onChange={(_e,v)=> setLensSize(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
          <Typography gutterBottom>Lens scale</Typography>
          <Slider min={2.0} max={15.0} step={0.1} value={lensScale} onChange={(_e,v)=> setLensScale(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
          <Typography gutterBottom>Label base distance</Typography>
          <Slider min={10} max={36} step={2} value={labelBaseDist} onChange={(_e,v)=> setLabelBaseDist(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
          <Typography gutterBottom>Label rings (attempts)</Typography>
          <Slider min={1} max={6} step={1} value={labelRings} onChange={(_e,v)=> setLabelRings(Array.isArray(v)? v[0] : v)} sx={{ width:'90%', ml:1, mb:1 }} />
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

      {showDiag && (
        <Box sx={{ mt:2 }}>
          <Typography variant="h6" sx={{ color:'#e0e0e0', mb:1 }}>Diagnostics</Typography>
          <Typography variant="body2" sx={{ color:'#b0bec5' }}>Sensors: {plan?.debug?.sensorCount ?? 0} (source: {sensorsSource})</Typography>
          <Typography variant="body2" sx={{ color:'#b0bec5' }}>Placed by: pairmap {plan?.debug?.reasonCounts?.pairmap||0}, kg {plan?.debug?.reasonCounts?.kg||0}, color {plan?.debug?.reasonCounts?.color||0}, nearest {plan?.debug?.reasonCounts?.nearest||0}</Typography>
          <Typography variant="subtitle2" sx={{ color:'#9fb3c8', mt:1 }}>Detected KGs</Typography>
          <Box sx={{ pl:1 }}>
            {(plan?.debug?.kgStats||[]).map((k)=> (
              <Typography key={String(k.kg)} variant="body2" sx={{ color:'#cfd8dc' }}>KG {k.kg}: {k.count} sensors → group {k.group!=null? `#${(k.group+1)}${k.groupName? ' ('+k.groupName+')':''}`:'?'}</Typography>
            ))}
            {(!plan?.debug?.kgStats || plan.debug.kgStats.length===0) && (
              <Typography variant="body2" sx={{ color:'#cfd8dc' }}>(none)</Typography>
            )}
          </Box>
          <Typography variant="subtitle2" sx={{ color:'#9fb3c8', mt:1 }}>Color IDs</Typography>
          <Box sx={{ pl:1 }}>
            {(plan?.debug?.colorStats||[]).map((c)=> (
              <Typography key={String(c.colorId)} variant="body2" sx={{ color:'#cfd8dc' }}>CID {c.colorId}: {c.count} sensors → group {c.group!=null? `#${(c.group+1)}${c.groupName? ' ('+c.groupName+')':''}`:'?'}</Typography>
            ))}
            {(!plan?.debug?.colorStats || plan.debug.colorStats.length===0) && (
              <Typography variant="body2" sx={{ color:'#cfd8dc' }}>(none)</Typography>
            )}
          </Box>
          <Typography variant="body2" sx={{ color:'#b0bec5', mt:1 }}>Groups in map JSON: {plan?.debug?.groupCount ?? 0}</Typography>
          <Typography variant="subtitle2" sx={{ color:'#9fb3c8', mt:1 }}>Unplaced sensors (first 20 of {plan?.debug?.unplacedTotal||0})</Typography>
          <Box sx={{ pl:1 }}>
            {(plan?.debug?.unplaced||[]).map((s, i)=> (
              <Typography key={`${s.code||i}-${i}`} variant="body2" sx={{ color:'#ffcdd2' }}>{s.code||''} {s.name||''} [KP{s.kp}|KG{s.kg}] → {s.reason}</Typography>
            ))}
            {(!plan?.debug?.unplaced || plan.debug.unplaced.length===0) && (
              <Typography variant="body2" sx={{ color:'#cfd8dc' }}>(none)</Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );

  const mainContent = (
    <Box sx={{ position:'relative', width:'100%', height:'calc(100vh - 12px)', overflow:'hidden' }}>
      <PlanSvg svgRef={svgRef} plan={plan} width={plan.width} height={plan.height} strokeWidth={strokeWidth} glow={glow} showOverlay={overlayBase} overlayOpacity={overlayOpacity} activePairKey={activePairKey} activeGroupIndex={focusGroup} labelBaseDist={labelBaseDist} labelRings={labelRings} inlineLabels={inlineLabels}
               onPointerMove={(p)=> { if (lensOn) setLensPos(p); }} />
      {lensOn && (
        <Box sx={{ position:'absolute', left: Math.max(0, lensPos.clientX - lensSize/2), top: Math.max(0, lensPos.clientY - lensSize/2), width:lensSize, height:lensSize, border:'2px solid #90a4ae', borderRadius:1, boxShadow:3, overflow:'hidden', bgcolor:'#1e1f22' }}
             onWheel={(e)=>{
               e.preventDefault();
               const dir = e.deltaY < 0 ? 1.12 : 0.9;
               setLensScale(s => Math.min(15.0, Math.max(2.0, s*dir)));
             }}>
          <PlanSvg plan={plan} width={plan.width} height={plan.height} strokeWidth={strokeWidth} glow={true} showOverlay={overlayBase} overlayOpacity={overlayOpacity} activePairKey={activePairKey} activeGroupIndex={focusGroup} labelBaseDist={labelBaseDist} labelRings={labelRings} inlineLabels={inlineLabels}
                   suppressHover={true}
                   overrideViewBox={`${Math.max(0, Math.min(plan.width - (plan.width/lensScale), lensPos.x - (plan.width/(lensScale*2))))} ${Math.max(0, Math.min(plan.height - (plan.height/lensScale), lensPos.y - (plan.height/(lensScale*2))))} ${plan.width / lensScale} ${plan.height / lensScale}`} />
        </Box>
      )}
      <Dialog open={zoomOpen} onClose={()=> setZoomOpen(false)} fullWidth maxWidth="lg">
        <Box sx={{ p:2, bgcolor:'#1e1f22' }}>
          <Typography variant="subtitle1" sx={{ color:'#cfd8dc', mb:1 }}>Zoom</Typography>
          <Box sx={{ width:'90vw', maxWidth:'100%', maxHeight:'80vh', overflow:'auto' }}>
            <PlanSvg plan={plan} width={plan.width} height={plan.height} strokeWidth={strokeWidth} glow={true} showOverlay={overlayBase} overlayOpacity={overlayOpacity} activePairKey={activePairKey} activeGroupIndex={focusGroup} labelBaseDist={labelBaseDist} labelRings={labelRings} inlineLabels={inlineLabels} />
          </Box>
          <Box sx={{ mt:1, textAlign:'right' }}>
            <Button onClick={()=> setZoomOpen(false)} variant="contained" size="small">Close</Button>
          </Box>
        </Box>
      </Dialog>
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
