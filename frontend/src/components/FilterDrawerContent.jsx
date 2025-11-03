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
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1,
        mb: 2
      }}>
        <Button size="medium" variant="contained" onClick={() => onQuickRange && onQuickRange('1h')}>1H</Button>
        <Button size="medium" variant="contained" onClick={() => onQuickRange && onQuickRange('6h')}>6H</Button>
        <Button size="medium" variant="contained" onClick={() => onQuickRange && onQuickRange('24h')}>24H</Button>
        <Button size="medium" variant="contained" onClick={() => onQuickRange && onQuickRange('7d')}>7D</Button>
        <Button size="medium" variant="contained" onClick={() => onQuickRange && onQuickRange('30d')}>30D</Button>
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
