/**
 * Spatial Memory Panel
 * Displays and manages spatial memories - EXTRACTED to prevent render loops
 */

import { useState } from 'react';
import { useAIStore } from '../../stores/aiStore';
import { useSpatialMemoryStore, useMemoryCount, useAllMemories } from '../../stores/spatialMemoryStore';
import { useLeftHand, useRightHand } from '../../stores/handStore';

export default function SpatialMemoryPanel() {
  const memoryCount = useMemoryCount();
  const allMemories = useAllMemories();
  const leftHand = useLeftHand();
  const rightHand = useRightHand();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleRememberSpot = () => {
    // Reset form and show it
    setLabel('');
    setDescription('');
    setEditingId(null);
    setShowForm(true);
  };

  const handleSubmitMemory = () => {
    if (!label.trim()) return;

    if (editingId) {
      // Update existing memory
      useSpatialMemoryStore.getState().updateMemory(editingId, {
        label: label.trim(),
        description: description.trim() || undefined,
      });
      setEditingId(null);
    } else {
      // Create new memory
      const hand = rightHand?.visible ? rightHand : leftHand?.visible ? leftHand : null;
      const position = hand?.position || [0, 1, 0];

      useAIStore.getState().rememberLocation(
        position,
        label.trim(),
        description.trim() || undefined
      );
    }

    // Reset and close form
    setLabel('');
    setDescription('');
    setShowForm(false);
  };

  const handleCancelForm = () => {
    setLabel('');
    setDescription('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleClearAll = () => {
    setShowConfirmClear(true);
  };

  const handleConfirmClear = () => {
    useSpatialMemoryStore.getState().clearAllMemories();
    setShowConfirmClear(false);
  };

  const handleCancelClear = () => {
    setShowConfirmClear(false);
  };

  const handleEditMemory = (memory: any) => {
    setEditingId(memory.id);
    setLabel(memory.label);
    setDescription(memory.description || '');
    setShowForm(true);
  };

  const handleDeleteMemory = (memoryId: string) => {
    useSpatialMemoryStore.getState().removeMemory(memoryId);
  };

  return (
    <>
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
              <div key={memory.id} className="bg-gray-800/50 rounded p-2 group relative">
                <div className="font-medium text-white text-[10px]">"{memory.label}"</div>
                <div className="text-gray-400 text-[9px]">
                  [{memory.position[0].toFixed(1)}, {memory.position[1].toFixed(1)}, {memory.position[2].toFixed(1)}]
                </div>
                {memory.description && (
                  <div className="text-gray-500 text-[9px] mt-0.5">{memory.description}</div>
                )}

                {/* Edit/Delete buttons - show on hover */}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEditMemory(memory)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-1.5 py-0.5 rounded text-[9px]"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteMemory(memory.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-1.5 py-0.5 rounded text-[9px]"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
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

    {/* Memory Input Form Modal */}
    {showForm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-gray-800 rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">
            {editingId ? 'Edit Memory' : 'Remember Location'}
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Label *</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., my desk"
                className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 focus:border-purple-500 focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitMemory();
                  if (e.key === 'Escape') handleCancelForm();
                }}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., where I work"
                className="w-full bg-gray-900 text-white px-3 py-2 rounded text-sm border border-gray-700 focus:border-purple-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitMemory();
                  if (e.key === 'Escape') handleCancelForm();
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCancelForm}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitMemory}
              disabled={!label.trim()}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-2 rounded text-sm font-semibold transition-colors"
            >
              {editingId ? 'Update' : 'Remember'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Clear Confirmation Modal */}
    {showConfirmClear && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-gray-800 rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">Clear All Memories?</h3>
          <p className="text-sm text-gray-400 mb-4">
            This will permanently delete all {memoryCount} spatial memories. This action cannot be undone.
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleCancelClear}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClear}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-semibold transition-colors"
            >
              Delete All
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
