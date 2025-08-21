import React, { useState } from 'react';
import axios from 'axios';
import DashboardLayout from './layout/DashboardLayout';
import FilterDrawerContent from './components/FilterDrawerContent';
import SensorDataDashboard from './components/SensorDataDashboard';
import { pivotSensorData } from './utils/pivotSensorData';

function groupDataBySensorType(rows) {
  const groups = {};
  if (!rows) return groups;
  rows.forEach(item => {
    const parts = item.mt_name.split('.');
    const sensorType = parts[parts.length - 1];
    if (!groups[sensorType]) {
      groups[sensorType] = [];
    }
    groups[sensorType].push(item);
  });
  return groups;
}

function App() {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [sensorType, setSensorType] = useState('');
  const [data, setData] = useState([]);

  const fetchData = () => {
    // Build your URL
    let url = '/api/sensor-data/filtered?';
    if (startTime) url += `start=${encodeURIComponent(startTime)}&`;
    if (endTime) url += `end=${encodeURIComponent(endTime)}&`;
    if (sensorType) url += `sensor_type=${encodeURIComponent(sensorType)}`;
    // Make request
    axios.get(url)
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  };

  const groupedData = groupDataBySensorType(data);
  const pivotedData = pivotSensorData(data);

  // Drawer content
  const drawerContent = (
    <FilterDrawerContent
      startTime={startTime} setStartTime={setStartTime}
      endTime={endTime} setEndTime={setEndTime}
      sensorType={sensorType} setSensorType={setSensorType}
      onFetch={fetchData}
    />
  );

  // Main content (no big "Sensor Data Dashboard" title)
  const mainContent = (
    <SensorDataDashboard
      groupedData={groupedData}
      pivotedData={pivotedData}
    />
  );

  return (
    <DashboardLayout
      drawerContent={drawerContent}
      mainContent={mainContent}
    />
  );
}

export default App;
