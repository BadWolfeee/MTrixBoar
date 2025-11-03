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

// Flexible by-table fetch; supports raw pagination and downsample
// options: { start, end, limit, offset, order, after, before, downsample, target_points }
export async function fetchSensorDataByTable(table, options = {}) {
  const {
    start,
    end,
    limit = 1000,
    offset,
    order,
    after,
    before,
    downsample,
    target_points,
  } = options;

  const params = new URLSearchParams({ sensor: table, limit });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (typeof offset === 'number') params.set("offset", String(offset));
  if (order) params.set("order", order);
  if (after) params.set("after", after);
  if (before) params.set("before", before);
  if (downsample) params.set("downsample", String(downsample));
  if (target_points) params.set("target_points", String(target_points));

  const res = await fetch(`/api/sensor-data/by-table?` + params.toString());
  if (!res.ok) throw new Error("Failed to fetch sensor data");
  return res.json();
}

export async function fetchSensorDataByTableDownsample(table, opts = {}) {
  return fetchSensorDataByTable(table, { ...opts, downsample: true });
}
