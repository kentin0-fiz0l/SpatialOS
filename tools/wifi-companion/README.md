# WiFi Companion App

WebSocket server that scans WiFi networks for SpatialOS room positioning.

## What it does

1. Scans nearby WiFi networks every 2 seconds
2. Sends RSSI (signal strength) data via WebSocket
3. SpatialOS uses trilateration to calculate room position

## Setup

```bash
cd tools/wifi-companion
npm install
```

## Usage

```bash
npm start
```

You should see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SpatialOS WiFi Companion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ WebSocket server listening on port 8080

Waiting for SpatialOS to connect...
```

## Calibration

After starting, you need to calibrate router positions:

1. Open SpatialOS in browser
2. Go to Settings → Positioning
3. Enable "WiFi Only" mode
4. Click "Calibrate Routers"
5. Add 3+ router positions

## Permissions

**macOS**: You may need to grant terminal access to Location Services:
- System Settings → Privacy & Security → Location Services
- Enable for Terminal

**Linux**: May need root access for WiFi scanning:
```bash
sudo npm start
```

## Troubleshooting

**No networks found:**
- Check WiFi is enabled
- Try `sudo npm start` on Linux
- Grant Location Services on macOS

**Connection refused:**
- Make sure port 8080 is not in use
- Check firewall settings

**Inaccurate positioning:**
- Need 3+ routers for trilateration
- Router positions must be accurately measured
- Metal/concrete walls reduce accuracy

## How it works

### RSSI to Distance
Signal strength (RSSI) is converted to distance using the log-distance path loss model:

```
distance = 10^((A - RSSI) / (10 * n))
```

where:
- A = RSSI at 1 meter (-45 dBm typically)
- n = path loss exponent (2.5 for indoor)

### Trilateration
With 3+ distance measurements, calculates position using least-squares optimization.

## Protocol

### Request (from SpatialOS)
```json
{
  "type": "scan"
}
```

### Response (to SpatialOS)
```json
{
  "networks": [
    {
      "ssid": "MyWiFi",
      "bssid": "aa:bb:cc:dd:ee:ff",
      "rssi": -45
    }
  ],
  "timestamp": 1234567890
}
```

## Dependencies

- `ws` - WebSocket server
- `node-wifi` - WiFi scanning library
