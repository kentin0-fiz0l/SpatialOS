import { useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import StatusBar from './components/UI/StatusBar';

// Lazy load heavy components
const Scene3D = lazy(() => import('./components/Scene3D/Scene3D'));
const WebcamFeed = lazy(() => import('./components/UI/WebcamFeed'));
const CalibrationPanel = lazy(() => import('./components/UI/CalibrationPanel'));

function App() {
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

      console.log('[App] All services initialized');
    })();

    return () => {
      if (mcpClient) mcpClient.disconnect();
      if (fusionService) fusionService.stop();
    };
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

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg p-3 text-xs">
          <p className="text-gray-400 mb-1">Voice Commands (PTT - Hold Spacebar):</p>
          <ul className="text-gray-300 space-y-0.5">
            <li>• "Create a note [text]"</li>
            <li>• "Set a timer for [duration]"</li>
          </ul>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

export default App;
