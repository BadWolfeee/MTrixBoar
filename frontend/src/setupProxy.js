const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

// Load .env from repo root if present so we can read BACKEND_PORT
try {
  const dotenv = require('dotenv');
  const rootEnv = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  } else {
    dotenv.config();
  }
} catch (e) {
  // optional
}

module.exports = function (app) {
  const port = process.env.BACKEND_PORT || process.env.PORT || '5000';
  const target = `http://localhost:${port}`;
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      logLevel: 'warn',
    })
  );
};

