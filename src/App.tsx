import { useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import StatusBar from './components/UI/StatusBar';
import TestHarness from './components/UI/TestHarness';
import SpatialMemoryPanel from './components/UI/SpatialMemoryPanel';
import { useSpatialStore } from './stores/spatialStore';
import { ollamaService } from './services/ollamaService';
import { useAIStore, useAILoading, useAIError } from './stores/aiStore';

// Lazy load heavy components
const Scene3D = lazy(() => import('./components/Scene3D/Scene3D'));
const WebcamFeed = lazy(() => import('./components/UI/WebcamFeed'));
const CalibrationPanel = lazy(() => import('./components/UI/CalibrationPanel'));

function App() {
  const isAILoading = useAILoading();
  const aiError = useAIError();

  useEffect(() => {
    // Lazy load services to reduce initial bundle
    let mcpClient: any;
    let fusionService: any;

    (async () => {
      // Initialize store (load saved objects)
      const { initializeSpatialStore } = await import('./stores/spatialStore');
      initializeSpatialStore();

      // Connect to MCP server
      const { initializeMCPClient } = await import('./services/mcpClient');
      mcpClient = initializeMCPClient();

      // Initialize sensor fusion (starts immediately)
      const { initializeSensorFusion } = await import('./services/sensorFusion');
      fusionService = initializeSensorFusion();

      // Initialize hand simulator service (for testing)
      const { initializeHandSimulator } = await import('./services/handSimulatorService');
      initializeHandSimulator();

      // Test Ollama connection
      const ollamaAvailable = await ollamaService.ping();
      if (ollamaAvailable) {
        console.log('[App] ✅ Ollama connected at localhost:11434, model:', ollamaService.getModel());
      } else {
        console.warn('[App] ⚠️  Ollama not available at localhost:11434 - AI features disabled');
      }

      console.log('[App] All services initialized');
    })();

    return () => {
      if (mcpClient) mcpClient.disconnect();
      if (fusionService) fusionService.stop();
    };
  }, []);

  // Keyboard shortcut for debug mode (D key)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        const currentDebugMode = useSpatialStore.getState().debugMode;
        useSpatialStore.getState().setDebugMode(!currentDebugMode);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <ErrorBoundary>
      <div className="w-screen h-screen bg-gray-900 text-white relative">
        {/* Status Bar (always visible) */}
        <StatusBar />

        <Suspense
        fallback={
          <div className="w-screen h-screen flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="text-4xl mb-4">🚀</div>
              <div className="text-xl font-bold mb-2">SpatialOS</div>
              <div className="text-sm text-gray-400">Loading 3D environment...</div>
            </div>
          </div>
        }
      >
        {/* 3D Scene */}
        <Scene3D />

        {/* Webcam Feed + Hand Tracking */}
        <WebcamFeed />

        {/* Calibration Panel (sensor fusion) */}
        <CalibrationPanel />
      </Suspense>

      {/* Overlay UI */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4">
          <h1 className="text-2xl font-bold mb-2">SpatialOS</h1>
          <p className="text-sm text-gray-400">
            Voice + Hand Tracking + WiFi
          </p>
          <div className="mt-3 text-xs text-green-400">
            ● 3D Scene Active
          </div>
        </div>
      </div>

      {/* AI Status Panel (top right) */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg p-3 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isAILoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-gray-400">AI {isAILoading ? 'Thinking...' : 'Ready'}</span>
          </div>
          {aiError && (
            <div className="mt-2 text-red-400 text-[10px]">
              Error: {aiError}
            </div>
          )}
          <button
            onClick={() => {
              const store = useAIStore.getState();
              store.queryAI('Say hello in one sentence!', [0, 1, 0]);
            }}
            disabled={isAILoading}
            className="mt-2 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-[10px] font-semibold transition-colors"
          >
            🤖 Test AI
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10 space-y-2">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg p-3 text-xs">
          <p className="text-gray-400 mb-1">Gestures:</p>
          <ul className="text-gray-300 space-y-0.5">
            <li>• <strong>Pinch</strong> - Grab/throw objects</li>
            <li>• <strong>Fist</strong> - Ask AI about nearby space</li>
          </ul>
        </div>

        <div className="bg-black/50 backdrop-blur-sm rounded-lg p-3 text-xs">
          <p className="text-gray-400 mb-1">Voice Commands (PTT - Hold Spacebar):</p>
          <ul className="text-gray-300 space-y-0.5">
            <li>• "Create a note [text]"</li>
            <li>• "Set a timer for [duration]"</li>
          </ul>
        </div>

        {/* Test Objects Button */}
        <button
          onClick={() => {
            import('./stores/spatialStore').then(({ useSpatialStore }) => {
              const store = useSpatialStore.getState();
              // Clear old objects first
              const objects = store.getAllObjects();
              objects.forEach(obj => store.deleteObject(obj.id));

              // Create new objects at hand-reachable positions
              // Hand reaches: X=[-1, 1], Y=[0, 0.9], Z=[-1.5, -1.8]
              store.addObject({ type: 'note', content: { text: 'Grab me!' }, position: [0, 0.5, -1.6] });
              store.addObject({ type: 'timer', content: { duration: 30, label: 'Test', startTime: Date.now(), remainingTime: 30 }, position: [0.6, 0.5, -1.6] });
              store.addObject({ type: 'widget', content: { widgetType: 'clock' }, position: [-0.6, 0.5, -1.6] });
            });
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          ✨ Create Test Objects
        </button>
      </div>

      {/* Test Harness for automated physics testing */}
      <TestHarness />

      {/* Spatial Memory Panel */}
      <SpatialMemoryPanel />
    </div>
    </ErrorBoundary>
  );
}

export default App;
