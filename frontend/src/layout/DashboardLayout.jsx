// src/layout/DashboardLayout.jsx
import React from 'react';
import { Box, CssBaseline, Drawer, Toolbar } from '@mui/material';

const drawerWidth = 280; // adjust as needed

function DashboardLayout({ drawerContent, mainContent }) {
  return (
    <Box sx={{
        display: 'flex',
        flexGrow: 1,
        p: 0, // smaller padding
        }}>
      <CssBaseline />

      {/* The Permanent Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        {/* The content for filters goes here */}
        <Box sx={{ overflow: 'auto', p: 2 }}>
          {drawerContent}
        </Box>
      </Drawer>

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 2,
          //ml: `${drawerWidth}px`, // Ensure content starts after the drawer
        }}
      >
        <Toolbar />
        {mainContent}
      </Box>
    </Box>
  );
}

export default DashboardLayout;
