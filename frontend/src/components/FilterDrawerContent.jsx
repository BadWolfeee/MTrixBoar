import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';

const FilterDrawerContent = ({
  startTime, setStartTime,
  endTime, setEndTime,
  sensorType, setSensorType,
  onFetch,
  onQuickRange,
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
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Button size="small" variant="outlined" onClick={() => onQuickRange && onQuickRange('1h')}>1h</Button>
        <Button size="small" variant="outlined" onClick={() => onQuickRange && onQuickRange('6h')}>6h</Button>
        <Button size="small" variant="outlined" onClick={() => onQuickRange && onQuickRange('24h')}>24h</Button>
        <Button size="small" variant="outlined" onClick={() => onQuickRange && onQuickRange('7d')}>7d</Button>
        <Button size="small" variant="outlined" onClick={() => onQuickRange && onQuickRange('30d')}>30d</Button>
      </Box>
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
