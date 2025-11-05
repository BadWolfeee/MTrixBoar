import React, { useEffect, useState } from "react";
import { Box, Button, FormControlLabel, Switch, Slider, Typography, MenuItem, Select, InputLabel, FormControl, Stack } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { Link, useLocation } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";

function MapLinesView({ width=3.5, glow=true, glowStrength=1.4, focusIndex=null, scheme='replicate', onGroupCount }){
  const [data, setData] = useState(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mapKey = params.get('map') || 'lines';
  useEffect(()=>{
    let active=true; const url = `${process.env.PUBLIC_URL || ''}/maps/${mapKey}.json`;
    fetch(url).then(r=>r.json()).then(j=>{ if(!active) return; setData(j); onGroupCount && onGroupCount((j.groups||[]).length||0); }).catch(()=>{});
    return ()=>{ active=false };
  },[onGroupCount, mapKey]);

  const W = data?.width || 1024; const H = data?.height || 768;
  const groups = (data?.groups || []).slice();
  const avgY = (g)=>{ let s=0,c=0; for(const pl of (g.polylines||[])){ for(const pt of pl){ s+=pt[1]; c++; }} return c? s/c : 0; };
  groups.sort((a,b)=>avgY(a)-avgY(b));
  const palette = scheme==='replicate' ? ['#e74c3c','#2ecc71','#40c4ff','#ffd740'] : ['#00e5ff','#ff6ec7','#00ff95','#ffd54f','#ab47bc','#ff9100','#69f0ae','#ff8a80','#82b1ff','#ffff00'];

  return (
    <Box sx={{ position:'relative', width:'100%', maxWidth:1200, borderRadius:1, overflow:'hidden', boxShadow:3, background:'#1e1f22' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto' }}>
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={glow ? glowStrength : 0} result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {groups.map((g, gi)=>{
          const color = palette[gi % palette.length];
          const active = focusIndex==null || focusIndex===gi;
          return (
            <g key={gi} stroke={color} fill="none" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={active?1:0.55} filter={glow && active ? 'url(#neon-glow)' : undefined}>
              {(g.polylines||[]).map((pl, pi)=> (
                <polyline key={pi} points={pl.map(p=>`${p[0]},${p[1]}`).join(' ')} />
              ))}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

export default function MapPage(){
  const [strokeWidth, setStrokeWidth] = useState(3.5);
  const [glow, setGlow] = useState(true);
  const [glowStrength, setGlowStrength] = useState(1.4);
  const [focusIndex, setFocusIndex] = useState(0);
  const [scheme, setScheme] = useState('replicate');
  const [groupCount, setGroupCount] = useState(1);

  const drawerContent = (
    <Box>
      <Box sx={{ mb:2 }}>
        <Button component={Link} to="/" startIcon={<ArrowBackIosNewIcon/>} color="primary" variant="contained" size="medium" fullWidth sx={{ textTransform:'none', fontWeight:700, boxShadow:'none' }}>Back to main</Button>
      </Box>

      <Typography variant="h6" sx={{ color:'#e0e0e0', mb:1 }}>Appearance</Typography>
      <FormControl fullWidth size="small" sx={{ mb:2 }}>
        <InputLabel id="scheme-select-label">Color scheme</InputLabel>
        <Select labelId="scheme-select-label" label="Color scheme" value={scheme} onChange={(e)=>setScheme(e.target.value)}>
          <MenuItem value="replicate">Replicate: Red (top) + Green (bottom)</MenuItem>
          <MenuItem value="auto">Auto Palette</MenuItem>
        </Select>
      </FormControl>

      <Typography gutterBottom>Line weight</Typography>
      <Slider min={1} max={8} step={0.5} value={strokeWidth} onChange={(_e,v)=>setStrokeWidth(Array.isArray(v)?v[0]:v)} sx={{ width:'90%', ml:1, mb:1 }} />
      <FormControlLabel control={<Switch checked={glow} onChange={(e)=>setGlow(e.target.checked)} />} label="Neon glow" />
      <Typography gutterBottom sx={{ mt:1 }}>Glow strength</Typography>
      <Slider min={0} max={3} step={0.1} value={glowStrength} onChange={(_e,v)=>setGlowStrength(Array.isArray(v)?v[0]:v)} sx={{ width:'90%', ml:1, mb:2 }} />

      <Typography variant="h6" sx={{ color:'#e0e0e0', mb:1 }}>Lines</Typography>
      <Typography gutterBottom>Focus line</Typography>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={()=>setFocusIndex(i=>Math.max(0,i-1))}>Prev</Button>
        <Typography variant="body2" sx={{ alignSelf:'center', color:'#b0bec5' }}>#{(focusIndex??0)+1} / {groupCount}</Typography>
        <Button size="small" variant="outlined" onClick={()=>setFocusIndex(i=>Math.min(groupCount-1, i+1))}>Next</Button>
      </Stack>
    </Box>
  );

  const mainContent = (
    <Box>
      <Typography variant="h5" sx={{ color:'#e7e7e7', mb:2 }}>Map</Typography>
      <MapLinesView width={strokeWidth} glow={glow} glowStrength={glowStrength} focusIndex={focusIndex} scheme={scheme} onGroupCount={(n)=>{ setGroupCount(n); if (focusIndex>=n) setFocusIndex(0); }} />
    </Box>
  );

  return <DashboardLayout drawerContent={drawerContent} mainContent={mainContent} />;
}
