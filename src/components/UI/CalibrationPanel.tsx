/**
 * Calibration Panel
 *
 * UI for calibrating camera position to room coordinates
 */

import { useState } from 'react';
import {
  useCalibrationPoints,
  useIsCalibrated,
  useCameraPosition,
  useAddCalibrationPoint,
  useClearCalibration,
} from '../../stores/positioningStore';
import type { Vector3 } from '../../types/spatial.types';

export default function CalibrationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [roomX, setRoomX] = useState('0');
  const [roomY, setRoomY] = useState('0');
  const [roomZ, setRoomZ] = useState('0');

  const calibrationPoints = useCalibrationPoints();
  const isCalibrated = useIsCalibrated();
  const cameraPosition = useCameraPosition();
  const addCalibrationPoint = useAddCalibrationPoint();
  const clearCalibration = useClearCalibration();

  const handleAddPoint = () => {
    if (!cameraPosition) {
      alert('Camera position not available. Make sure the 3D scene is loaded.');
      return;
    }

    const roomPos: Vector3 = [
      parseFloat(roomX) || 0,
      parseFloat(roomY) || 0,
      parseFloat(roomZ) || 0,
    ];

    addCalibrationPoint(roomPos, cameraPosition);

    // Reset inputs
    setRoomX('0');
    setRoomY('0');
    setRoomZ('0');
  };

  const handleClearCalibration = () => {
    if (confirm('Clear all calibration points?')) {
      clearCalibration();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 transition-colors"
      >
        🧭 Calibrate Room
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 bg-gray-900 text-white p-6 rounded-lg shadow-2xl w-96 border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Room Calibration</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white text-2xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="mb-4 text-sm text-gray-300">
        <p className="mb-2">
          Stand at a known position in your room and mark it below.
        </p>
        <p className="text-xs text-gray-400">
          Need at least 2 points for calibration. More points = better accuracy.
        </p>
      </div>

      {/* Calibration Status */}
      <div className="mb-4 p-3 bg-gray-800 rounded">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">Status:</span>
          <span
            className={`text-sm font-semibold ${
              isCalibrated ? 'text-green-400' : 'text-yellow-400'
            }`}
          >
            {isCalibrated ? '✓ Calibrated' : '⚠ Not Calibrated'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Points:</span>
          <span className="text-sm font-mono">{calibrationPoints.length}</span>
        </div>
      </div>

      {/* Room Position Inputs */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">
          Known Room Position (meters):
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-400">X</label>
            <input
              type="number"
              step="0.1"
              value={roomX}
              onChange={(e) => setRoomX(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              placeholder="0.0"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Y</label>
            <input
              type="number"
              step="0.1"
              value={roomY}
              onChange={(e) => setRoomY(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              placeholder="0.0"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Z</label>
            <input
              type="number"
              step="0.1"
              value={roomZ}
              onChange={(e) => setRoomZ(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
              placeholder="0.0"
            />
          </div>
        </div>
      </div>

      {/* Current Camera Position */}
      {cameraPosition && (
        <div className="mb-4 p-2 bg-gray-800 rounded text-xs">
          <div className="text-gray-400 mb-1">Current Camera Position:</div>
          <div className="font-mono">
            [{cameraPosition[0].toFixed(2)}, {cameraPosition[1].toFixed(2)},{' '}
            {cameraPosition[2].toFixed(2)}]
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleAddPoint}
          disabled={!cameraPosition}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded font-semibold transition-colors"
        >
          + Add Point
        </button>
        {calibrationPoints.length > 0 && (
          <button
            onClick={handleClearCalibration}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Calibration Points List */}
      {calibrationPoints.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Calibration Points:</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {calibrationPoints.map((point, index) => (
              <div
                key={point.timestamp}
                className="text-xs bg-gray-800 p-2 rounded font-mono"
              >
                <span className="text-gray-400">#{index + 1}:</span> Room[
                {point.roomPosition[0].toFixed(1)}, {point.roomPosition[1].toFixed(1)},{' '}
                {point.roomPosition[2].toFixed(1)}] → Cam[
                {point.cameraPosition[0].toFixed(1)}, {point.cameraPosition[1].toFixed(1)},{' '}
                {point.cameraPosition[2].toFixed(1)}]
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded text-xs">
        <p className="font-semibold mb-1">How to calibrate:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-300">
          <li>Stand at a known location (e.g., room corner)</li>
          <li>Measure distance from room origin (meters)</li>
          <li>Enter coordinates above and click "Add Point"</li>
          <li>Move to another location and repeat</li>
          <li>2+ points needed, 3+ recommended</li>
        </ol>
      </div>
    </div>
  );
}
