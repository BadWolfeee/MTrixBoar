// src/index.js (or App.js if you prefer)
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import App from './App';

const theme = createTheme({
  spacing: 4,
  palette: {
    mode: 'dark',
    background: {
      default: '#303030',
      paper: '#424242'
    },
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' }
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
);
