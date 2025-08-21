// src/components/SensorDataTable.jsx
import React from 'react';

function SensorDataTable({ data }) {
  // Hardcode headers based on the pivoted data structure
  const headers = ['mt_time', 'I1', 'Analog', 'AI21', 'AI22'];
  
  return (
    <div style={{ padding: '20px' }}>
      <h2>Sensor Data</h2>
      <table border="1" cellPadding="5" cellSpacing="0">
        <thead>
          <tr>
            {headers.map(header => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.mt_time}>
              {headers.map(header => (
                <td key={header}>{row[header] || '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SensorDataTable;
