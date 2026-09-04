/**
 * Test Harness Component
 *
 * Automated testing UI for grab/throw physics tuning
 */

import { useState, useEffect } from 'react';
import { handSimulator, TEST_SEQUENCES } from '../../services/handSimulator';
import { useSpatialStore } from '../../stores/spatialStore';
import type { Vector3 } from '../../types/spatial.types';

interface TestResult {
  sequenceName: string;
  grabTime: number;
  releaseTime: number;
  expectedVelocity: Vector3;
  actualVelocity: Vector3;
  throwDistance: number;
  success: boolean;
}

export default function TestHarness() {
  const [isVisible, setIsVisible] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [selectedSequence, setSelectedSequence] = useState(0);

  // Poll simulator state
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const phase = handSimulator.getCurrentPhase();
      setCurrentPhase(phase);

      if (phase === 'done') {
        setIsRunning(false);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isRunning]);

  const runTest = () => {
    const sequence = TEST_SEQUENCES[selectedSequence];

    console.log('[TestHarness] Running test:', sequence.name);
    setIsRunning(true);
    setCurrentPhase('approach');

    // Create a test object at the grab position BEFORE starting the sequence
    useSpatialStore.getState().addObject({
      type: 'note',
      content: { text: 'Test Object' },
      position: sequence.grabPos,
      createdBy: 'hand',
    });
    console.log('[TestHarness] Created test object at:', sequence.grabPos);

    let grabTime = 0;
    let releaseTime = 0;
    let actualVelocity: Vector3 = [0, 0, 0];

    handSimulator.startSequence(sequence, {
      onGrab: (pos) => {
        grabTime = Date.now();
        console.log('[TestHarness] Grabbed at:', pos);
      },
      onRelease: (pos, velocity) => {
        releaseTime = Date.now();
        actualVelocity = velocity;
        console.log('[TestHarness] Released at:', pos, 'velocity:', velocity);

        // Calculate throw distance (magnitude of displacement)
        const throwDistance = Math.sqrt(
          velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2
        );

        // Record result
        const result: TestResult = {
          sequenceName: sequence.name,
          grabTime,
          releaseTime,
          expectedVelocity: sequence.releaseVelocity || [0, 0, 0],
          actualVelocity,
          throwDistance,
          success: throwDistance > 0.5, // Consider success if velocity > 0.5 m/s
        };

        setResults((prev) => [...prev, result]);
      },
    });
  };

  const runAllTests = () => {
    let index = 0;

    const runNext = () => {
      if (index >= TEST_SEQUENCES.length) {
        console.log('[TestHarness] All tests complete!');
        return;
      }

      setSelectedSequence(index);
      setTimeout(() => {
        runTest();
        index++;
        setTimeout(runNext, 2000); // Wait 2s between tests
      }, 500);
    };

    setResults([]); // Clear previous results
    runNext();
  };

  const clearResults = () => {
    setResults([]);
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-20 right-4 z-20 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors shadow-lg"
      >
        🧪 Test Harness
      </button>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-20 bg-black/80 backdrop-blur-sm rounded-lg p-4 w-96 max-h-[70vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">🧪 Throw Physics Tester</h2>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Test Sequence Selector */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Test Sequence:</label>
        <select
          value={selectedSequence}
          onChange={(e) => setSelectedSequence(Number(e.target.value))}
          disabled={isRunning}
          className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
        >
          {TEST_SEQUENCES.map((seq, idx) => (
            <option key={idx} value={idx}>
              {seq.name}
            </option>
          ))}
        </select>
      </div>

      {/* Status */}
      {isRunning && (
        <div className="mb-4 p-3 bg-purple-900/50 rounded border border-purple-500">
          <div className="text-sm text-purple-300">
            <strong>Status:</strong> {currentPhase.toUpperCase()}
          </div>
          <div className="text-xs text-purple-400 mt-1">
            Running: {TEST_SEQUENCES[selectedSequence].name}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={runTest}
          disabled={isRunning}
          className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition-colors"
        >
          ▶ Run Test
        </button>
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition-colors"
        >
          ⏭ Run All
        </button>
      </div>

      <button
        onClick={clearResults}
        className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition-colors mb-4"
      >
        🗑 Clear Results
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-300 mb-2">
            Results ({results.length})
          </h3>
          {results.map((result, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border ${
                result.success
                  ? 'bg-green-900/30 border-green-500'
                  : 'bg-red-900/30 border-red-500'
              }`}
            >
              <div className="text-sm font-semibold text-white mb-1">
                {result.success ? '✓' : '✗'} {result.sequenceName}
              </div>
              <div className="text-xs space-y-1">
                <div className="text-gray-300">
                  <strong>Velocity:</strong> [{result.actualVelocity[0].toFixed(2)}, {result.actualVelocity[1].toFixed(2)}, {result.actualVelocity[2].toFixed(2)}] m/s
                </div>
                <div className="text-gray-300">
                  <strong>Speed:</strong> {result.throwDistance.toFixed(2)} m/s
                </div>
                {result.expectedVelocity && (
                  <div className="text-gray-400">
                    <strong>Expected:</strong> [{result.expectedVelocity[0].toFixed(2)}, {result.expectedVelocity[1].toFixed(2)}, {result.expectedVelocity[2].toFixed(2)}] m/s
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 p-3 bg-gray-800/50 rounded text-xs text-gray-400">
        <p className="mb-2">
          <strong className="text-white">How it works:</strong>
        </p>
        <ul className="space-y-1 ml-4 list-disc">
          <li>Simulates hand grabbing an object</li>
          <li>Moves hand along predefined path</li>
          <li>Releases and measures throw velocity</li>
          <li>Compares actual vs expected physics</li>
        </ul>
      </div>
    </div>
  );
}
