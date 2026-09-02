#!/usr/bin/env node

/**
 * WiFi Companion Server
 *
 * WebSocket server that scans WiFi networks and sends RSSI data
 * Used by SpatialOS for room-scale positioning
 */

import { WebSocketServer } from 'ws';
import wifi from 'node-wifi';

const PORT = 8080;

// Initialize wifi module
wifi.init({
  iface: null // Use system default interface
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SpatialOS WiFi Companion');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`✓ WebSocket server listening on port ${PORT}`);
console.log('');
console.log('Waiting for SpatialOS to connect...');
console.log('');

wss.on('connection', (ws) => {
  console.log('✓ SpatialOS connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'scan') {
        // Scan WiFi networks
        const networks = await scanWiFi();
        const response = {
          networks,
          timestamp: Date.now(),
        };

        ws.send(JSON.stringify(response));
        console.log(`Sent ${networks.length} networks`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('SpatialOS disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

/**
 * Scan WiFi networks
 */
async function scanWiFi() {
  try {
    const networks = await wifi.scan();

    return networks.map((network) => ({
      ssid: network.ssid || '(hidden)',
      bssid: network.bssid || network.mac || 'unknown',
      rssi: network.signal_level || -80, // dBm
    }));
  } catch (error) {
    console.error('WiFi scan error:', error);
    return [];
  }
}

console.log('Press Ctrl+C to stop');
