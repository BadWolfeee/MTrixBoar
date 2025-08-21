// src/components/SensorDataGraph.jsx
import React from 'react';
import Plot from 'react-plotly.js';

function hexToRgba(hex, opacity) {
  // Remove '#' if present
  hex = hex.replace(/^#/, '');
  let r, g, b;
  if (hex.length === 3) {
    // e.g. "#abc" => "aabbcc"
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    throw new Error('Invalid hex color format');
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}


function SensorDataGraph({ data, color }) {
  // Set a default color if none is provided.
  const baseColor = color || '#1976d2'; // default blue
  // Create a fill color with transparency based on the base color.
  // For example, blue: rgba(25, 118, 210, 0.2)
  const fillColor = hexToRgba(baseColor, 0.2);

  const trace = {
    x: data.map(d => d.mt_time),
    y: data.map(d => parseFloat(d.mt_value)),
    mode: 'lines',
    type: 'scatter',
    name: 'Sensor',
    line: {
      color: baseColor,
      width: 2,
    },
    marker: {
      color: baseColor,
    },
    fill: 'tozeroy',    // fills the area between the trace and y=0
    fillcolor: fillColor,
  };

  const layout = {
    autosize: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#fff' },
    margin: { l: 40, r: 20, t: 20, b: 40 },
    legend: {
      orientation: 'h',
      x: 0.5,
      xanchor: 'center',
      y: 1.1,
    },
  };

  return (
    <Plot
      data={[trace]}
      layout={layout}
      style={{ width: '100%', height: '100%', minWidth: '300px', minHeight: '300px' }}
      useResizeHandler
    />
  );
}

export default SensorDataGraph;
