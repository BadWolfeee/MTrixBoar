import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';

const FilterDrawerContent = ({
  startTime, setStartTime,
  endTime, setEndTime,
  sensorType, setSensorType,
  onFetch,
  onQuickRange,
  activeQuick,
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
        gap: 1.25,
        mb: 2.5
      }}>
        {[
          ['1h','1H'],['6h','6H'],['24h','24H'],['7d','7D'],['30d','30D'],['180d','180D']
        ].map(([val,label]) => {
          const active = activeQuick === val;
          return (
            <Button
              key={val}
              size="medium"
              variant={active ? 'contained' : 'outlined'}
              color={active ? 'primary' : 'inherit'}
              sx={{
                fontWeight: 800,
                ...(active
                  ? { boxShadow: 'none' }
                  : {
                      color: '#cfd8dc',
                      borderColor: 'rgba(255,255,255,0.2)',
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      '&:hover': {
                        borderColor: '#90caf9',
                        backgroundColor: 'rgba(144,202,249,0.08)'
                      },
                    }),
              }}
              onClick={() => onQuickRange && onQuickRange(val)}
            >
              {label}
            </Button>
          );
        })}
      </Box>
      <TextField
        label="Start Time"
        type="datetime-local"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        fullWidth
        sx={{ mt: 0.5, mb: 2 }}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="End Time"
        type="datetime-local"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        fullWidth
        sx={{ mb: 2.5 }}
        InputLabelProps={{ shrink: true }}
      />
      <Button variant="contained" onClick={onFetch} fullWidth sx={{ py: 1 }}>
        Fetch Data
      </Button>
    </Box>
  );
};

export default FilterDrawerContent;
