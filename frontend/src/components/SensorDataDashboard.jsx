// frontend/src/components/SensorDataDashboard.jsx
import React from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import SensorDataGraph from "./SensorDataGraph";

const PREFERRED_ORDER = ["I1", "Analog", "AI21", "AI22"];
const COLORS = ["#1976d2", "#dc004e", "#388e3c", "#f57c00", "#9c27b0", "#00acc1", "#8d6e63"];

export default function SensorDataDashboard({ groupedData = {}, pivotedData }) {
  const keys = Object.keys(groupedData || {});
  if (!keys.length) {
    return (
      <Box sx={{ p: 2, color: "#e7e7e7" }}>
        <Typography variant="body1">No series found for this sensor/table.</Typography>
      </Box>
    );
  }

  const preferred = PREFERRED_ORDER.filter(k => keys.includes(k));
  const remaining = keys.filter(k => !PREFERRED_ORDER.includes(k)).sort();
  const ordered = [...preferred, ...remaining];

  return (
    <Box>
      <Grid container spacing={1}>
        {ordered.map((name, idx) => (
          <Grid key={name} size={{ xs: 12, sm: 6 }}>
            <Card sx={{ minHeight: 300 }}>
              <CardContent sx={{ height: "100%" }}>
                <Typography variant="subtitle1">{name}</Typography>
                <SensorDataGraph
                  data={groupedData[name] || []}
                  color={COLORS[idx % COLORS.length]}
                />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* if you want a table below, render it here with your SensorDataTable + pivotedData */}
    </Box>
  );
}
