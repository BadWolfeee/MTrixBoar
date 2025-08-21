import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';

const FilterDrawerContent = ({
  startTime, setStartTime,
  endTime, setEndTime,
  sensorType, setSensorType,
  onFetch
}) => {
  return (
    <Box>
      <Typography variant="h6" gutterBottom
      sx={{
        fontWeight: 'bold',
        textAlign: 'center',
        mt: 2
      }}
      >
        Sensor Dashboard
      </Typography>
      <TextField
        label="Start Time"
        type="datetime-local"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="End Time"
        type="datetime-local"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
        InputLabelProps={{ shrink: true }}
      />
      <Button variant="contained" onClick={onFetch} fullWidth>
        Fetch Data
      </Button>
    </Box>
  );
};

export default FilterDrawerContent;
