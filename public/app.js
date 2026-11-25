const moistureValue = document.getElementById('moistureValue');
const moistureLabel = document.getElementById('moistureLabel');
const moistureRing = document.getElementById('moistureRing');
const rawValue = document.getElementById('rawValue');
const lastSensorTime = document.getElementById('lastSensorTime');
const pumpStatus = document.getElementById('pumpStatus');
const modeStatus = document.getElementById('modeStatus');
const sensorStatus = document.getElementById('sensorStatus');
const connectionStatus = document.getElementById('connectionStatus');
const pumpToggle = document.getElementById('pumpToggle');
const pumpButtonText = document.getElementById('pumpButtonText');
const pumpButtonIcon = document.getElementById('pumpButtonIcon');
const autoMode = document.getElementById('autoMode');
const dryThreshold = document.getElementById('dryThreshold');
const wetThreshold = document.getElementById('wetThreshold');
const dryValue = document.getElementById('dryValue');
const wetValue = document.getElementById('wetValue');
const saveSettings = document.getElementById('saveSettings');

let current = null;

function updateStatusBadge(value, online) {
  connectionStatus.childNodes[connectionStatus.childNodes.length - 1].textContent = value;
  connectionStatus.classList.toggle('offline', !online);
}

function updateUI(data) {
  current = data;

  if (data.moisturePercent !== null) {
    moistureValue.textContent = data.moisturePercent;
    moistureRing.style.setProperty('--moisture', `${data.moisturePercent * 3.6}deg`);
    moistureLabel.textContent = data.moisturePercent < data.dryThreshold ? 'Too dry' : data.moisturePercent >= data.wetThreshold ? 'Well watered' : 'Normal';
  }

  rawValue.textContent = data.moistureRaw ?? '--';
  lastSensorTime.textContent = data.lastSensorAt ? new Date(data.lastSensorAt).toLocaleTimeString() : 'Waiting…';

  sensorStatus.textContent = data.sensorOnline ? 'Sensor online' : 'Sensor offline';
  sensorStatus.classList.toggle('offline', !data.sensorOnline);

  pumpStatus.textContent = data.pumpOn ? 'ON' : 'OFF';
  pumpStatus.className = data.pumpOn ? 'pump-on' : 'pump-off';
  pumpToggle.className = `pump-button ${data.pumpOn ? 'on' : 'off'}`;
  pumpButtonText.textContent = data.pumpOn ? 'Stop pump' : 'Start pump';
  pumpButtonIcon.textContent = data.pumpOn ? '■' : '●';

  modeStatus.textContent = data.autoMode ? 'Automatic' : 'Manual';
  autoMode.checked = data.autoMode;
  dryThreshold.value = data.dryThreshold;
  wetThreshold.value = data.wetThreshold;
  dryValue.textContent = `${data.dryThreshold}%`;
  wetValue.textContent = `${data.wetThreshold}%`;

  updateStatusBadge(data.sensorOnline ? 'ESP32 online' : 'ESP32 offline', data.sensorOnline);
}

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Status unavailable');
    updateUI(await response.json());
  } catch (error) {
    console.error(error);
    updateStatusBadge('Server offline', false);
  }
}

pumpToggle.addEventListener('click', async () => {
  if (!current) return;
  await fetch('/api/pump', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on: !current.pumpOn }),
  });
  fetchStatus();
});

autoMode.addEventListener('change', async () => {
  await saveMode(autoMode.checked);
});

saveSettings.addEventListener('click', () => saveMode(autoMode.checked));

dryThreshold.addEventListener('input', () => {
  dryValue.textContent = `${dryThreshold.value}%`;
  if (Number(dryThreshold.value) >= Number(wetThreshold.value)) {
    wetThreshold.value = Math.min(100, Number(dryThreshold.value) + 1);
    wetValue.textContent = `${wetThreshold.value}%`;
  }
});

wetThreshold.addEventListener('input', () => {
  wetValue.textContent = `${wetThreshold.value}%`;
  if (Number(wetThreshold.value) <= Number(dryThreshold.value)) {
    dryThreshold.value = Math.max(0, Number(wetThreshold.value) - 1);
    dryValue.textContent = `${dryThreshold.value}%`;
  }
});

async function saveMode(auto) {
  await fetch('/api/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auto,
      dryThreshold: Number(dryThreshold.value),
      wetThreshold: Number(wetThreshold.value),
    }),
  });
  fetchStatus();
}

fetchStatus();
setInterval(fetchStatus, 2000);
