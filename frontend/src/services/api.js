import axios from 'axios';

export async function getSensorData() {
  const response = await axios.get('/api/sensor-data');
  return response.data;
}
