const SERVICE_UUID = '0f4a0001-9e41-4b89-a2d5-571e5a110000';
const WIFI_CONFIG_UUID = '0f4a0002-9e41-4b89-a2d5-571e5a110000';
const WIFI_STATUS_UUID = '0f4a0003-9e41-4b89-a2d5-571e5a110000';

const form = document.getElementById('wifiForm');
const submitButton = document.getElementById('submitButton');
const statusElement = document.getElementById('status');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

async function readWifiStatus(characteristic) {
  const value = await characteristic.readValue();
  const json = new TextDecoder().decode(value);
  return JSON.parse(json);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!window.isSecureContext) {
    setStatus('Open this setup page over HTTPS to use Bluetooth.', true);
    return;
  }

  if (!navigator.bluetooth) {
    setStatus('This browser does not support Bluetooth setup. Use Android Chrome.', true);
    return;
  }

  const ssid = document.getElementById('ssid').value.trim();
  const password = document.getElementById('password').value;
  if (!ssid) {
    setStatus('Enter the hotspot name first.', true);
    return;
  }

  submitButton.disabled = true;
  let device;

  try {
    setStatus('Select your ESP32 in the Bluetooth device chooser.');
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    });

    setStatus('Connecting to ESP32 over Bluetooth…');
    const gatt = await device.gatt.connect();
    const service = await gatt.getPrimaryService(SERVICE_UUID);
    const wifiConfig = await service.getCharacteristic(WIFI_CONFIG_UUID);
    const wifiStatus = await service.getCharacteristic(WIFI_STATUS_UUID);
    const payload = JSON.stringify({ ssid, password });

    setStatus('Sending Wi-Fi details to the ESP32…');
    await wifiConfig.writeValueWithResponse(new TextEncoder().encode(payload));
    document.getElementById('password').value = '';

    const timeoutAt = Date.now() + 120000;
    while (Date.now() < timeoutAt) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const currentStatus = await readWifiStatus(wifiStatus);

      if (currentStatus.connected) {
        setStatus('ESP32 connected to the hotspot. Opening the dashboard…');
        setTimeout(() => { window.location.assign('/'); }, 1800);
        return;
      }

      if (currentStatus.failed) {
        throw new Error('ESP32 could not join that hotspot. Check its name, password, and 2.4 GHz setting, then try again.');
      }

      setStatus(`Connecting ESP32 to ${currentStatus.ssid || 'the hotspot'}…`);
    }

    throw new Error('Connection timed out. Keep the hotspot on and try again.');
  } catch (error) {
    if (error.name === 'NotFoundError') {
      setStatus('No ESP32 selected. Turn on the ESP32 and try again.', true);
    } else {
      setStatus(error.message || 'Wi-Fi setup failed.', true);
    }
  } finally {
    submitButton.disabled = false;
    if (device && device.gatt && device.gatt.connected) {
      device.gatt.disconnect();
    }
  }
});
