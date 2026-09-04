/**
 * Spatial Memory Panel
 * Displays and manages spatial memories - EXTRACTED to prevent render loops
 */

import { useAIStore } from '../../stores/aiStore';
import { useSpatialMemoryStore, useMemoryCount, useAllMemories } from '../../stores/spatialMemoryStore';
import { useLeftHand, useRightHand } from '../../stores/handStore';

export default function SpatialMemoryPanel() {
  const memoryCount = useMemoryCount();
  const allMemories = useAllMemories();
  const leftHand = useLeftHand();
  const rightHand = useRightHand();

  const handleRememberSpot = () => {
    const hand = rightHand?.visible ? rightHand : leftHand?.visible ? leftHand : null;
    const position = hand?.position || [0, 1, 0];

    const label = window.prompt('Label for this location:', 'my desk');
    if (label) {
      const description = window.prompt('Description (optional):', '');
      useAIStore.getState().rememberLocation(position, label, description || undefined);
    }
  };

  const handleClearAll = () => {
    if (window.confirm(`Delete all ${memoryCount} spatial memories?`)) {
      useSpatialMemoryStore.getState().clearAllMemories();
    }
  };

  return (
    <div className="absolute bottom-4 right-4 z-10">
      <div className="bg-black/50 backdrop-blur-sm rounded-lg p-3 text-xs max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-200">Spatial Memory</h3>
          <span className="text-gray-400">({memoryCount})</span>
        </div>

        <div className="max-h-32 overflow-y-auto mb-2 space-y-1">
          {allMemories.length === 0 ? (
            <p className="text-gray-500 text-[10px] italic">No memories yet</p>
          ) : (
            allMemories.map((memory) => (
              <div key={memory.id} className="bg-gray-800/50 rounded p-2">
                <div className="font-medium text-white text-[10px]">"{memory.label}"</div>
                <div className="text-gray-400 text-[9px]">
                  [{memory.position[0].toFixed(1)}, {memory.position[1].toFixed(1)}, {memory.position[2].toFixed(1)}]
                </div>
                {memory.description && (
                  <div className="text-gray-500 text-[9px] mt-0.5">{memory.description}</div>
                )}
              </div>
            ))
          )}
        </div>

        <button
          onClick={handleRememberSpot}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white px-2 py-1.5 rounded text-[10px] font-semibold transition-colors mb-1"
        >
          📍 Remember This Spot
        </button>

        {memoryCount > 0 && (
          <button
            onClick={handleClearAll}
            className="w-full bg-red-600/50 hover:bg-red-600 text-white px-2 py-1 rounded text-[9px] font-semibold transition-colors"
          >
            🗑️ Clear All
          </button>
        )}
      </div>
    </div>
  );
}
