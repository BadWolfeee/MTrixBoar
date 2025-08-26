import axios from 'axios';

// export async function getSensorData() {
//  const response = await axios.get('/api/sensor-data');
//  return response.data;
//}

export async function getSensorData(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch('/api/sensor-data' + (qs ? `?${qs}` : ''));
  if (!res.ok) throw new Error('Failed to fetch sensor data');
  return res.json();
}

// frontend/src/services/api.js
export async function fetchSensors() {
  const res = await fetch("/api/sensors");
  if (!res.ok) throw new Error("Failed to fetch sensors");
  return res.json(); // [{ table, name, approx_rows, latest, notes }, ...]
}

export async function fetchSensorDataByTable(table, { start, end, limit = 500 } = {}) {
  const params = new URLSearchParams({ sensor: table, limit });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const res = await fetch(`/api/sensor-data/by-table?` + params.toString());
  if (!res.ok) throw new Error("Failed to fetch sensor data");
  return res.json();
}
