/**
 * WiFi Trilateration
 *
 * Calculate position from WiFi signal strengths using trilateration
 */

import type { Vector3 } from '../types/spatial.types';

interface RouterSignal {
  position: Vector3;
  distance: number;
}

/**
 * Convert RSSI (signal strength) to distance estimate
 * Using log-distance path loss model
 *
 * RSSI = -10n * log10(d) + A
 * where:
 * - n = path loss exponent (2-4, typically 2.5 for indoor)
 * - d = distance in meters
 * - A = RSSI at 1 meter (typically -40 to -50 dBm)
 */
export function rssiToDistance(rssi: number): number {
  const A = -45; // RSSI at 1 meter
  const n = 2.5; // Path loss exponent (indoor)

  const distance = Math.pow(10, (A - rssi) / (10 * n));
  return Math.max(0.1, Math.min(distance, 50)); // Clamp to 0.1-50m
}

/**
 * Trilateration: Calculate position from 3+ distance measurements
 *
 * Uses least-squares optimization to find the point that best fits
 * the distance constraints from all routers
 */
export function trilaterate(signals: RouterSignal[]): Vector3 | null {
  if (signals.length < 3) {
    console.warn('[Trilateration] Need at least 3 signals');
    return null;
  }

  // Use weighted least-squares
  // Start with centroid as initial guess
  let centroid: Vector3 = [0, 0, 0];
  for (const s of signals) {
    centroid[0] += s.position[0];
    centroid[1] += s.position[1];
    centroid[2] += s.position[2];
  }
  centroid = [
    centroid[0] / signals.length,
    centroid[1] / signals.length,
    centroid[2] / signals.length,
  ];

  // Iterative optimization (gradient descent)
  let position = centroid;
  const learningRate = 0.1;
  const iterations = 50;

  for (let iter = 0; iter < iterations; iter++) {
    const gradient: Vector3 = [0, 0, 0];

    for (const signal of signals) {
      const [rx, ry, rz] = signal.position;
      const [px, py, pz] = position;

      // Distance from current position to router
      const dx = px - rx;
      const dy = py - ry;
      const dz = pz - rz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 0.01) continue; // Avoid division by zero

      // Error: difference between measured and calculated distance
      const error = dist - signal.distance;

      // Gradient of squared error
      gradient[0] += (error * dx) / dist;
      gradient[1] += (error * dy) / dist;
      gradient[2] += (error * dz) / dist;
    }

    // Update position
    const newPos: Vector3 = [
      position[0] - learningRate * gradient[0],
      position[1] - learningRate * gradient[1],
      position[2] - learningRate * gradient[2],
    ];
    position = newPos;
  }

  return position;
}

/**
 * Calculate position confidence based on signal quality
 * Returns 0-1 (1 = very confident, 0 = no confidence)
 */
export function calculateConfidence(signals: RouterSignal[]): number {
  if (signals.length < 3) return 0;

  // Confidence factors:
  // 1. Number of signals (more is better)
  // 2. Signal strength variance (less variance is better)
  // 3. Geometric dilution of precision (better spread is better)

  // Factor 1: Number of signals (3=0.7, 4=0.85, 5+=1.0)
  const countFactor = Math.min(1.0, 0.4 + signals.length * 0.15);

  // Factor 2: Distance variance (lower is better)
  const distances = signals.map((s) => s.distance);
  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance =
    distances.reduce((acc, d) => acc + Math.pow(d - avgDist, 2), 0) /
    distances.length;
  const varianceFactor = Math.exp(-variance / 10); // Exponential decay

  // Combine factors
  const confidence = countFactor * varianceFactor;

  return Math.max(0, Math.min(1, confidence));
}
