/**
 * Status Bar Component
 *
 * Displays system status indicators (MCP, hand tracking, object count)
 */

import { useState } from 'react';
import { useTrackingActive } from '../../stores/handStore';
import { useObjectCount } from '../../stores/spatialStore';

export default function StatusBar() {
  const [isVisible, setIsVisible] = useState(true);
  const [mcpConnected, setMcpConnected] = useState(false); // TODO: Wire up MCP connection tracking
  const trackingActive = useTrackingActive();
  const objectCount = useObjectCount();

  if (!isVisible) {
    // Show compact toggle button when hidden
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed top-4 left-1/2 -translate-x-1/2 bg-black/30 backdrop-blur-sm rounded-full p-2 hover:bg-black/50 transition-colors z-20"
        aria-label="Show status bar"
      >
        <span className="text-gray-400 text-xs">📊</span>
      </button>
    );
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-4 border border-gray-700/50">
        {/* MCP Server Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              mcpConnected ? 'bg-green-400' : 'bg-red-400'
            } animate-pulse`}
            aria-label={mcpConnected ? 'MCP connected' : 'MCP disconnected'}
          />
          <span className="text-sm text-gray-300 hidden sm:inline">
            🔌 MCP: {mcpConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="text-sm text-gray-300 sm:hidden">🔌</span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-gray-600" />

        {/* Hand Tracking Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              trackingActive ? 'bg-green-400' : 'bg-gray-500'
            } ${trackingActive ? 'animate-pulse' : ''}`}
            aria-label={trackingActive ? 'Hand tracking active' : 'Hand tracking inactive'}
          />
          <span className="text-sm text-gray-300 hidden sm:inline">
            ✋ Hands: {trackingActive ? 'Active' : 'Inactive'}
          </span>
          <span className="text-sm text-gray-300 sm:hidden">✋</span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-gray-600" />

        {/* Object Count */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">
            📦 <span className="hidden sm:inline">Objects:</span> {objectCount}
          </span>
        </div>

        {/* Hide button */}
        <button
          onClick={() => setIsVisible(false)}
          className="ml-2 text-gray-400 hover:text-white transition-colors text-sm"
          aria-label="Hide status bar"
        >
          ×
        </button>
      </div>
    </div>
  );
}
