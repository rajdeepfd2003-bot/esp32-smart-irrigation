#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// Public dashboard URL.
const char* SERVER_URL = "https://esp32-smart-irrigation.onrender.com";
const char* BLE_DEVICE_NAME = "ESP32-Irrigation";
const char* BLE_SERVICE_UUID = "0f4a0001-9e41-4b89-a2d5-571e5a110000";
const char* WIFI_CONFIG_UUID = "0f4a0002-9e41-4b89-a2d5-571e5a110000";
const char* WIFI_STATUS_UUID = "0f4a0003-9e41-4b89-a2d5-571e5a110000";

const int MOISTURE_PIN = 34;
const int RELAY_PIN = 26;
const bool RELAY_ACTIVE_LOW = true;

Preferences preferences;
BLECharacteristic* wifiStatusCharacteristic = nullptr;

int DRY_ADC = 4095;
int WET_ADC = 1500;

unsigned long lastSensorPostMs = 0;
unsigned long lastStatusPollMs = 0;
unsigned long pumpStartedMs = 0;
bool pumpOn = false;
String wifiSsid;
String wifiPassword;
String requestedSsid;
String requestedPassword;
String wifiError;
bool wifiConnectPending = false;
bool wifiConnectionFailed = false;
bool credentialsPending = false;
unsigned long wifiAttemptStartedMs = 0;
unsigned long nextWifiAttemptMs = 0;

class WifiConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    auto rawValue = characteristic->getValue();
    String payload = rawValue.c_str();
    StaticJsonDocument<256> config;
    DeserializationError error = deserializeJson(config, payload);
    if (error || !config["ssid"].is<const char*>() ||
        !config["password"].is<const char*>()) {
      wifiError = "Invalid Wi-Fi settings.";
      wifiConnectionFailed = true;
      return;
    }

    String ssid = config["ssid"].as<String>();
    String password = config["password"].as<String>();
    if (ssid.isEmpty() || ssid.length() > 32 || password.length() > 63) {
      wifiError = "Wi-Fi name or password is too long.";
      wifiConnectionFailed = true;
      return;
    }

    requestedSsid = ssid;
    requestedPassword = password;
    wifiError = "";
    wifiConnectionFailed = false;
    credentialsPending = true;
  }
};

class WifiServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer* server) override {
    BLEDevice::startAdvertising();
  }
};

void startBluetoothProvisioning() {
  BLEDevice::init(BLE_DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new WifiServerCallbacks());

  BLEService* service = server->createService(BLE_SERVICE_UUID);
  BLECharacteristic* configCharacteristic = service->createCharacteristic(
      WIFI_CONFIG_UUID, BLECharacteristic::PROPERTY_WRITE);
  configCharacteristic->setCallbacks(new WifiConfigCallbacks());

  wifiStatusCharacteristic = service->createCharacteristic(
      WIFI_STATUS_UUID, BLECharacteristic::PROPERTY_READ);
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("Bluetooth setup is available as %s\n", BLE_DEVICE_NAME);
}

void updateWifiStatus() {
  if (wifiStatusCharacteristic == nullptr) return;

  StaticJsonDocument<256> status;
  status["connected"] = WiFi.status() == WL_CONNECTED;
  status["connecting"] = wifiConnectPending || credentialsPending;
  status["failed"] = wifiConnectionFailed;
  status["ssid"] = wifiSsid;
  status["error"] = wifiError;

  String json;
  serializeJson(status, json);
  wifiStatusCharacteristic->setValue(json.c_str());
}

void processWifiCredentials() {
  if (!credentialsPending) return;

  credentialsPending = false;
  wifiSsid = requestedSsid;
  wifiPassword = requestedPassword;
  preferences.putString("ssid", wifiSsid);
  preferences.putString("password", wifiPassword);
  wifiError = "";
  WiFi.disconnect(false, false);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  wifiConnectPending = true;
  wifiConnectionFailed = false;
  wifiAttemptStartedMs = millis();
  Serial.println("Wi-Fi credentials received; joining the configured network.");
}

void connectSavedWifi() {
  if (wifiSsid.isEmpty()) return;

  Serial.printf("Connecting to saved network: %s\n", wifiSsid.c_str());
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  wifiConnectPending = true;
  wifiConnectionFailed = false;
  wifiAttemptStartedMs = millis();
}

void setRelay(bool on) {
  pumpOn = on;
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
  if (on && pumpStartedMs == 0) pumpStartedMs = millis();
  if (!on) pumpStartedMs = 0;
}

int readMoisture() {
  long sum = 0;
  for (int i = 0; i < 20; i++) {
    sum += analogRead(MOISTURE_PIN);
    delay(3);
  }

  int raw = sum / 20;
  int percent = map(raw, DRY_ADC, WET_ADC, 0, 100);
  return constrain(percent, 0, 100);
}

void postReading(int raw, int percent) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/sensor");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> json;
  json["moistureRaw"] = raw;
  json["moisturePercent"] = percent;

  String body;
  serializeJson(json, body);
  int code = http.POST(body);
  if (code < 0) Serial.printf("Sensor POST failed: %s\n", http.errorToString(code).c_str());
  http.end();
}

void pollStatus() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/status");
  int code = http.GET();

  if (code == 200) {
    StaticJsonDocument<512> json;
    DeserializationError error = deserializeJson(json, http.getString());
    if (!error && json["pumpOn"].is<bool>()) {
      setRelay(json["pumpOn"]);
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);

  analogReadResolution(12);
  analogSetPinAttenuation(MOISTURE_PIN, ADC_11db);

  preferences.begin("irrigation", false);
  wifiSsid = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");

  WiFi.mode(WIFI_STA);
  startBluetoothProvisioning();
  if (!wifiSsid.isEmpty()) {
    connectSavedWifi();
  } else {
    Serial.println("No saved Wi-Fi. Scan the setup QR code and configure over Bluetooth.");
  }
}

void loop() {
  processWifiCredentials();

  if (wifiConnectPending && WiFi.status() == WL_CONNECTED) {
    wifiConnectPending = false;
    Serial.print("Connected to Wi-Fi. ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else if (wifiConnectPending &&
             (WiFi.status() == WL_CONNECT_FAILED ||
              millis() - wifiAttemptStartedMs >= 30000)) {
    wifiConnectPending = false;
    wifiConnectionFailed = true;
    nextWifiAttemptMs = millis() + 15000;
    Serial.println("Wi-Fi connection failed. Check the credentials and try again.");
  } else if (!wifiSsid.isEmpty() && WiFi.status() != WL_CONNECTED &&
             !wifiConnectPending && millis() >= nextWifiAttemptMs) {
    setRelay(false);
    connectSavedWifi();
  }

  unsigned long now = millis();

  if (WiFi.status() == WL_CONNECTED && now - lastSensorPostMs >= 2000) {
    lastSensorPostMs = now;

    long sum = 0;
    for (int i = 0; i < 20; i++) {
      sum += analogRead(MOISTURE_PIN);
      delay(3);
    }

    int raw = sum / 20;
    int percent = map(raw, DRY_ADC, WET_ADC, 0, 100);
    percent = constrain(percent, 0, 100);

    postReading(raw, percent);
  }

  if (WiFi.status() == WL_CONNECTED && now - lastStatusPollMs >= 1000) {
    lastStatusPollMs = now;
    pollStatus();
  }

  if (pumpOn && pumpStartedMs != 0 && now - pumpStartedMs >= 5UL * 60UL * 1000UL) {
    setRelay(false);
  }

  static unsigned long lastWifiStatusUpdateMs = 0;
  if (now - lastWifiStatusUpdateMs >= 1000) {
    lastWifiStatusUpdateMs = now;
    updateWifiStatus();
  }
}
