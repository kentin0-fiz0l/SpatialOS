import { useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import StatusBar from './components/UI/StatusBar';
import VoiceIndicator from './components/UI/VoiceIndicator';
import ErrorOverlay from './components/UI/ErrorOverlay';
import TestHarness from './components/UI/TestHarness';
import SpatialMemoryPanel from './components/UI/SpatialMemoryPanel';
import SpatialMemorySuggestions from './components/UI/SpatialMemorySuggestions';
import { useSpatialStore } from './stores/spatialStore';
import { ollamaService } from './services/ollamaService';
import { useAIStore, useAILoading, useAIError } from './stores/aiStore';
import { useHandStore } from './stores/handStore';
import { useVoiceStore } from './stores/voiceStore';
import { getVoiceService } from './services/voiceService';
import type { VoiceCommand } from './services/voiceService';

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
    let a2a: any;

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

      // Initialize A2A for multi-user collaboration
      try {
        const { initializeA2A, a2aService } = await import('./services/a2aService');
        await initializeA2A();
        a2a = a2aService;
        console.log('[App] ✅ A2A multi-user enabled');
      } catch (error) {
        console.warn('[App] ⚠️  A2A unavailable, running single-user mode');
      }

      // Initialize voice service
      const voiceService = getVoiceService();
      useVoiceStore.getState().setAvailable(voiceService.isAvailable());

      // Handle voice commands
      voiceService.onCommand(handleVoiceCommand);
      voiceService.onTranscript((text) => {
        useVoiceStore.getState().setTranscript(text);
      });

      console.log('[App] ✅ Voice service initialized, available:', voiceService.isAvailable());

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
      if (a2a) a2a.disconnect();
    };
  }, []);

  // Handle voice commands
  const handleVoiceCommand = (command: VoiceCommand) => {
    const store = useSpatialStore.getState();
    const voiceStore = useVoiceStore.getState();

    console.log('[App] Voice command received:', command);
    voiceStore.setLastCommand(command.type);

    switch (command.type) {
      case 'create_note':
        store.addObject({
          type: 'note',
          content: { text: command.text },
          position: [0, 1, -2], // In front of user
          createdBy: 'voice',
        });
        break;

      case 'create_timer':
        store.addObject({
          type: 'timer',
          content: {
            duration: command.duration,
            label: command.label,
            startTime: Date.now(),
            remainingTime: command.duration,
          },
          position: [0.5, 1, -2],
          createdBy: 'voice',
        });
        break;

      case 'create_image':
        store.addObject({
          type: 'image',
          content: { url: command.url },
          position: [-0.5, 1, -2],
          createdBy: 'voice',
        });
        break;

      case 'create_widget':
        store.addObject({
          type: 'widget',
          content: { widgetType: command.widgetType as any },
          position: [0, 1.5, -2],
          createdBy: 'voice',
        });
        break;

      case 'delete_all':
        const objects = store.getAllObjects();
        objects.forEach((obj) => store.deleteObject(obj.id));
        console.log('[App] Deleted all objects');
        break;

      case 'remember_location': {
        // Get hand position or use default
        const leftHand = useHandStore.getState().leftHand;
        const rightHand = useHandStore.getState().rightHand;
        const hand = rightHand?.visible ? rightHand : leftHand?.visible ? leftHand : null;
        const position = hand?.position || [0, 1, 0]; // Default to center if no hand visible

        // Create spatial memory
        useAIStore.getState().rememberLocation(
          position,
          command.label,
          command.description
        );

        console.log(`[App] Created spatial memory "${command.label}" at`, position);
        break;
      }

      case 'unknown':
        console.warn('[App] Unknown voice command:', command.rawText);
        voiceStore.setError(`Unknown command: "${command.rawText}"`);
        setTimeout(() => voiceStore.setError(null), 3000);
        break;
    }
  };

  // Keyboard shortcuts: Spacebar (PTT voice)
  useEffect(() => {
    const voiceService = getVoiceService();

    const handleKeyDown = (e: KeyboardEvent) => {
      // PTT: Start voice recognition on spacebar press
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        voiceService.startListening();
        useVoiceStore.getState().setListening(true);
        useVoiceStore.getState().clearTranscript();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // PTT: Stop voice recognition on spacebar release
      if (e.key === ' ') {
        e.preventDefault();
        voiceService.stopListening();
        useVoiceStore.getState().setListening(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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
            <li>• "Remember this is [label]"</li>
          </ul>
        </div>

        {/* Test Objects Button */}
        <button
          onClick={async () => {
            const { a2aService } = await import('./services/a2aService');

            console.log('[App] Creating test objects with Physics Arbiter validation...');

            // Create objects with validation - Hand reaches: X=[-1, 1], Y=[0, 0.9], Z=[-1.5, -1.8]
            const results = await Promise.all([
              a2aService.createValidatedObject({
                type: 'note',
                content: { text: 'Validated!' },
                position: [0, 0.5, -1.6],
                createdBy: 'hand'
              }),
              a2aService.createValidatedObject({
                type: 'timer',
                content: { duration: 30, label: 'Test', startTime: Date.now(), remainingTime: 30 },
                position: [0.6, 0.5, -1.6],
                createdBy: 'hand'
              }),
              a2aService.createValidatedObject({
                type: 'widget',
                content: { widgetType: 'clock' },
                position: [-0.6, 0.5, -1.6],
                createdBy: 'hand'
              }),
            ]);

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success);

            console.log(`[App] ✅ Created ${successful}/3 objects`);
            if (failed.length > 0) {
              failed.forEach(f => console.warn(`[App] ❌ Failed: ${f.reason}`));
            }
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          ✨ Create Test Objects (Multi-User)
        </button>
      </div>

      {/* Voice Indicator */}
      <VoiceIndicator />

      {/* Error Overlay - shows error messages */}
      <ErrorOverlay />

      {/* Test Harness for automated physics testing */}
      <TestHarness />

      {/* Spatial Memory Panel */}
      <SpatialMemoryPanel />

      {/* Spatial Memory Suggestions - AI-powered placement hints */}
      <SpatialMemorySuggestions objectType="note" />
    </div>
    </ErrorBoundary>
  );
}

export default App;
