# ESP32 Smart Irrigation

The public dashboard is hosted at <https://esp32-smart-irrigation.onrender.com>.
The ESP32 reads the HW-080 soil sensor on GPIO 34 and controls the pump relay
on GPIO 26.

## Wiring

- HW-080 analog output → ESP32 GPIO 34
- Relay input/signal → ESP32 GPIO 26
- Power the pump using a suitable external supply and relay contacts.
- Never power the pump directly from ESP32 pins.

## Configure a phone hotspot

1. Upload `ESP32_Cloud_Irrigation.ino` to the ESP32.
2. Keep the phone's mobile hotspot enabled and mobile data on.
3. Scan the Wi-Fi setup QR code (available from the dashboard's **Configure
   Wi-Fi** page at `/setup`) or open
   <https://esp32-smart-irrigation.onrender.com/setup>.
4. Enter the phone hotspot SSID and password.
5. Tap **Connect ESP32 and continue**, select `ESP32-Irrigation` in the
   Bluetooth device picker.
6. Keep the setup page open. Once the ESP32 joins the hotspot, it redirects to
   the irrigation dashboard.

This uses Bluetooth provisioning so the same phone can keep its hotspot active
while entering credentials. It requires a browser with Web Bluetooth support
(for example, Chrome on Android) and a 2.4 GHz hotspot. The Wi-Fi credentials
are saved on the ESP32 and reused after restart. The current firmware does not
enable BLE pairing encryption; provision the device only in a trusted place.

The QR is a link to the public setup page; it does not contain hotspot
credentials. The QR should be printed or shown on another screen for scanning.

## Dashboard

Open <https://esp32-smart-irrigation.onrender.com> from any phone or computer
with internet access. The dashboard has manual pump control and automatic mode
with configurable dry/wet thresholds.

The dashboard and its pump-control API are public and have no login; anyone
with the URL can use the controls.

## Sensor calibration

In the sketch, adjust `DRY_ADC` and `WET_ADC` after measuring the sensor in dry
conditions and in water. The percentage shown depends on these calibration
values and the sensor's orientation/soil.

Install the ArduinoJson library before compiling the sketch. ESP32 Arduino
board support provides the BLE APIs used by the firmware.
