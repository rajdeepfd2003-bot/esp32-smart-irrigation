const express = require('express');
const path = require('path');

const DEFAULT_CONFIG = {
  autoMode: false,
  dryThreshold: 40,
  wetThreshold: 65,
};

const appState = {
  pumpOn: false,
  autoMode: DEFAULT_CONFIG.autoMode,
  dryThreshold: DEFAULT_CONFIG.dryThreshold,
  wetThreshold: DEFAULT_CONFIG.wetThreshold,
  moisturePercent: null,
  moistureRaw: null,
  lastSensorAt: null,
  lastPumpChangeAt: null,
  sensorOnline: false,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/status', (req, res) => {
    const sensorOnline = appState.lastSensorAt
      ? Date.now() - new Date(appState.lastSensorAt).getTime() < 30000
      : false;

    res.json({ ...appState, sensorOnline });
  });

  app.post('/api/sensor', (req, res) => {
    const percent = Number(req.body && req.body.moisturePercent);
    const raw = Number(req.body && req.body.moistureRaw);

    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ success: false, error: 'moisturePercent must be 0-100' });
    }

    appState.moisturePercent = Math.round(percent);
    appState.moistureRaw = Number.isFinite(raw) ? Math.round(raw) : null;
    appState.lastSensorAt = new Date().toISOString();

    if (appState.autoMode && appState.moisturePercent <= appState.dryThreshold) {
      appState.pumpOn = true;
    } else if (appState.autoMode && appState.moisturePercent >= appState.wetThreshold) {
      appState.pumpOn = false;
    }

    if (req.body && typeof req.body.pumpOn === 'boolean') {
      appState.pumpOn = req.body.pumpOn;
    }

    res.json({ success: true, pumpOn: appState.pumpOn });
  });

  app.post('/api/pump', (req, res) => {
    if (typeof (req.body && req.body.on) !== 'boolean') {
      return res.status(400).json({ success: false, error: 'on must be true or false' });
    }

    appState.autoMode = false;
    appState.pumpOn = req.body.on;
    appState.lastPumpChangeAt = new Date().toISOString();

    res.json({ success: true, pumpOn: appState.pumpOn, autoMode: appState.autoMode });
  });

  app.post('/api/mode', (req, res) => {
    if (typeof (req.body && req.body.auto) !== 'boolean') {
      return res.status(400).json({ success: false, error: 'auto must be true or false' });
    }

    appState.autoMode = req.body.auto;

    if (Number.isFinite(Number(req.body.dryThreshold))) {
      appState.dryThreshold = clamp(Number(req.body.dryThreshold), 0, 99);
    }
    if (Number.isFinite(Number(req.body.wetThreshold))) {
      appState.wetThreshold = clamp(Number(req.body.wetThreshold), 1, 100);
    }
    if (appState.dryThreshold >= appState.wetThreshold) {
      appState.wetThreshold = Math.min(100, appState.dryThreshold + 1);
    }

    res.json({ success: true, autoMode: appState.autoMode, dryThreshold: appState.dryThreshold, wetThreshold: appState.wetThreshold });
  });

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Soil irrigation dashboard running at http://localhost:${port}`);
  });
}

module.exports = { createApp, DEFAULT_CONFIG, appState };
