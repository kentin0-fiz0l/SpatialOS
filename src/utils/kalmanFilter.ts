/**
 * Kalman Filter for Sensor Fusion
 *
 * Fuses WiFi position (low frequency, high noise) with camera position
 * (high frequency, low noise) to produce optimal position estimate.
 *
 * Based on the discrete Kalman filter equations:
 * - Prediction: x̂ₖ₋ = Ax̂ₖ₋₁ + Buₖ
 * - Update: x̂ₖ = x̂ₖ₋ + K(zₖ - Hx̂ₖ₋)
 */

export interface KalmanState {
  // State estimate [x, y, z, vx, vy, vz]
  x: number[];
  // Error covariance matrix (6x6)
  P: number[][];
}

export interface KalmanMeasurement {
  value: number[]; // Measured position [x, y, z]
  timestamp: number; // Unix timestamp in ms
  type: 'wifi' | 'camera';
}

/**
 * Kalman Filter for 3D position tracking
 */
export class KalmanFilter3D {
  private state: KalmanState;
  private lastUpdateTime: number;

  // Process noise covariance (how much we trust the model)
  private Q: number[][];

  // Measurement noise covariance for WiFi (±2-5m accuracy)
  private R_wifi: number[][];

  // Measurement noise covariance for camera (±0.01m accuracy)
  private R_camera: number[][];

  constructor(initialPosition: number[] = [0, 0, 0]) {
    // Initialize state [x, y, z, vx, vy, vz]
    this.state = {
      x: [...initialPosition, 0, 0, 0],
      P: this.createIdentityMatrix(6, 100), // Initial uncertainty
    };

    this.lastUpdateTime = Date.now();

    // Process noise (model uncertainty)
    // Higher values = trust measurements more than prediction
    this.Q = this.createIdentityMatrix(6, 0.01);

    // WiFi measurement noise (±2-5m)
    const wifiVariance = 4; // 2m standard deviation squared
    this.R_wifi = [
      [wifiVariance, 0, 0],
      [0, wifiVariance, 0],
      [0, 0, wifiVariance],
    ];

    // Camera measurement noise (±0.01m)
    const cameraVariance = 0.0001; // 0.01m standard deviation squared
    this.R_camera = [
      [cameraVariance, 0, 0],
      [0, cameraVariance, 0],
      [0, 0, cameraVariance],
    ];
  }

  /**
   * Predict next state based on motion model
   */
  private predict(dt: number): void {
    // State transition matrix (constant velocity model)
    const A = [
      [1, 0, 0, dt, 0, 0],
      [0, 1, 0, 0, dt, 0],
      [0, 0, 1, 0, 0, dt],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 1],
    ];

    // Predict state: x̂ₖ₋ = Ax̂ₖ₋₁
    this.state.x = this.matrixVectorMultiply(A, this.state.x);

    // Predict covariance: Pₖ₋ = APₖ₋₁Aᵀ + Q
    const AP = this.matrixMultiply(A, this.state.P);
    const APAt = this.matrixMultiply(AP, this.transpose(A));
    this.state.P = this.matrixAdd(APAt, this.Q);
  }

  /**
   * Update state with new measurement
   */
  update(measurement: KalmanMeasurement): number[] {
    const now = measurement.timestamp;
    const dt = (now - this.lastUpdateTime) / 1000; // Convert to seconds

    // Prediction step
    if (dt > 0 && dt < 1) {
      // Only predict if dt is reasonable (< 1 second)
      this.predict(dt);
    }

    // Measurement matrix (we measure position, not velocity)
    const H = [
      [1, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
    ];

    // Choose measurement noise based on sensor type
    const R = measurement.type === 'wifi' ? this.R_wifi : this.R_camera;

    // Innovation: y = z - Hx̂
    const Hx = this.matrixVectorMultiply(H, this.state.x);
    const innovation = [
      measurement.value[0] - Hx[0],
      measurement.value[1] - Hx[1],
      measurement.value[2] - Hx[2],
    ];

    // Innovation covariance: S = HPHᵀ + R
    const HP = this.matrixMultiply(H, this.state.P);
    const HPHt = this.matrixMultiply(HP, this.transpose(H));
    const S = this.matrixAdd(HPHt, R);

    // Kalman gain: K = PHᵀS⁻¹
    const PHt = this.matrixMultiply(this.state.P, this.transpose(H));
    const S_inv = this.invert3x3(S);
    const K = this.matrixMultiply(PHt, S_inv);

    // Update state: x̂ₖ = x̂ₖ₋ + Ky
    const Ky = this.matrixVectorMultiply(K, innovation);
    this.state.x = this.state.x.map((x, i) => x + Ky[i]);

    // Update covariance: Pₖ = (I - KH)Pₖ₋
    const I = this.createIdentityMatrix(6, 1);
    const KH = this.matrixMultiply(K, H);
    const I_KH = this.matrixSubtract(I, KH);
    this.state.P = this.matrixMultiply(I_KH, this.state.P);

    this.lastUpdateTime = now;

    // Return estimated position [x, y, z]
    return [this.state.x[0], this.state.x[1], this.state.x[2]];
  }

  /**
   * Get current position estimate
   */
  getPosition(): number[] {
    return [this.state.x[0], this.state.x[1], this.state.x[2]];
  }

  /**
   * Get current velocity estimate
   */
  getVelocity(): number[] {
    return [this.state.x[3], this.state.x[4], this.state.x[5]];
  }

  /**
   * Get position uncertainty (standard deviation)
   */
  getUncertainty(): number[] {
    return [
      Math.sqrt(this.state.P[0][0]),
      Math.sqrt(this.state.P[1][1]),
      Math.sqrt(this.state.P[2][2]),
    ];
  }

  // Matrix operations helpers

  private createIdentityMatrix(size: number, scale: number): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < size; i++) {
      matrix[i] = [];
      for (let j = 0; j < size; j++) {
        matrix[i][j] = i === j ? scale : 0;
      }
    }
    return matrix;
  }

  private matrixMultiply(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = B[0].length;
    const inner = A[0].length;
    const result: number[][] = [];

    for (let i = 0; i < rows; i++) {
      result[i] = [];
      for (let j = 0; j < cols; j++) {
        let sum = 0;
        for (let k = 0; k < inner; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  private matrixVectorMultiply(A: number[][], v: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < A.length; i++) {
      let sum = 0;
      for (let j = 0; j < v.length; j++) {
        sum += A[i][j] * v[j];
      }
      result[i] = sum;
    }
    return result;
  }

  private matrixAdd(A: number[][], B: number[][]): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < A[0].length; j++) {
        result[i][j] = A[i][j] + B[i][j];
      }
    }
    return result;
  }

  private matrixSubtract(A: number[][], B: number[][]): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < A[0].length; j++) {
        result[i][j] = A[i][j] - B[i][j];
      }
    }
    return result;
  }

  private transpose(A: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;
    const result: number[][] = [];

    for (let i = 0; i < cols; i++) {
      result[i] = [];
      for (let j = 0; j < rows; j++) {
        result[i][j] = A[j][i];
      }
    }
    return result;
  }

  private invert3x3(m: number[][]): number[][] {
    // Calculate determinant
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

    if (Math.abs(det) < 1e-10) {
      // Singular matrix, return identity
      return this.createIdentityMatrix(3, 1);
    }

    // Calculate inverse using adjugate matrix
    const invDet = 1 / det;
    const inv: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    inv[0][0] = (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invDet;
    inv[0][1] = (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invDet;
    inv[0][2] = (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invDet;
    inv[1][0] = (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invDet;
    inv[1][1] = (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invDet;
    inv[1][2] = (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invDet;
    inv[2][0] = (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invDet;
    inv[2][1] = (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invDet;
    inv[2][2] = (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invDet;

    return inv;
  }
}
