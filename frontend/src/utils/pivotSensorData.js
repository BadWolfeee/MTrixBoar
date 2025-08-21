// src/utils/pivotSensorData.js
export function pivotSensorData(data) {
    const pivot = {};
    data.forEach(item => {
      const time = item.mt_time;
      const parts = item.mt_name.split('.');
      const sensorType = parts[parts.length - 1];
      if (!pivot[time]) {
        pivot[time] = { mt_time: time };
      }
      pivot[time][sensorType] = item.mt_value;
    });
    return Object.values(pivot).sort((a, b) => new Date(a.mt_time) - new Date(b.mt_time));
  }
  