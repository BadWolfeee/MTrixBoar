import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import Grid from '@mui/material/Grid'; // if using MUI v6+ (Grid v2)
import SensorDataGraph from './SensorDataGraph';
import SensorDataTable from './SensorDataTable';

const SensorDataDashboard = ({ groupedData, pivotedData }) => {
  return (
    <Box>
      {/* 2x2 Grid of Charts */}
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ minHeight: 300 }}>
            <CardContent sx={{ height: '100%' }}>
              <Typography variant="subtitle1">I1</Typography>
              <SensorDataGraph data={groupedData['I1'] || []} color="#1976d2" />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ minHeight: 300 }}>
            <CardContent sx={{ height: '100%' }}>
              <Typography variant="subtitle1">Analog</Typography>
              <SensorDataGraph data={groupedData['Analog'] || []} color="#dc004e" />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ minHeight: 300 }}>
            <CardContent sx={{ height: '100%' }}>
              <Typography variant="subtitle1">AI21</Typography>
              <SensorDataGraph data={groupedData['AI21'] || []} color="#388e3c" />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ minHeight: 300 }}>
            <CardContent sx={{ height: '100%' }}>
              <Typography variant="subtitle1">AI22</Typography>
              <SensorDataGraph data={groupedData['AI22'] || []} color="#f57c00" />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Table below */}
      <Box sx={{ mt: 2 }}>
        <Card>
          <CardContent>
            <SensorDataTable data={pivotedData} />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default SensorDataDashboard;
