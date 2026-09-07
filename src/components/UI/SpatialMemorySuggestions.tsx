/**
 * Spatial Memory Suggestions Component
 *
 * Shows AI-powered placement suggestions based on learned patterns
 */

import { useState, useEffect } from 'react';
import { a2aService } from '../../services/a2aService';

interface Suggestion {
  position: [number, number, number];
  reason: string;
  confidence: number;
}

interface SpatialMemorySuggestionsProps {
  objectType?: string;
}

export default function SpatialMemorySuggestions({ objectType = 'note' }: SpatialMemorySuggestionsProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Auto-fetch suggestion when object type changes
    if (objectType) {
      fetchSuggestion();
    }
  }, [objectType]);

  const fetchSuggestion = async () => {
    setLoading(true);
    try {
      const result = await a2aService.getPlacementSuggestion(objectType);
      if (result.suggestion) {
        setSuggestion(result.suggestion);
        setVisible(true);

        // Auto-hide after 10 seconds
        setTimeout(() => setVisible(false), 10000);
      } else {
        setSuggestion(null);
        setVisible(false);
      }
    } catch (error) {
      console.error('[SpatialMemory] Failed to fetch suggestion:', error);
      setSuggestion(null);
      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !suggestion) {
    return (
      <div className="fixed bottom-24 right-4 z-20">
        <button
          onClick={fetchSuggestion}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-2 rounded-lg text-xs font-semibold shadow-lg transition-colors"
          title="Get placement suggestion from Spatial Memory"
        >
          {loading ? '🧠 Thinking...' : '🧠 Ask Memory'}
        </button>
      </div>
    );
  }

  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor =
    confidencePercent >= 70 ? 'text-green-400' :
    confidencePercent >= 50 ? 'text-yellow-400' :
    'text-orange-400';

  return (
    <div className="fixed bottom-24 right-4 z-20 max-w-sm">
      <div className="bg-purple-900/90 backdrop-blur-sm rounded-lg p-4 shadow-xl border border-purple-500/30 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="text-sm font-bold text-purple-200">Spatial Memory</span>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-purple-300 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Suggestion */}
        <div className="space-y-2">
          <p className="text-white text-sm">
            💡 {suggestion.reason}
          </p>

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${
                  confidencePercent >= 70 ? 'bg-green-500' :
                  confidencePercent >= 50 ? 'bg-yellow-500' :
                  'bg-orange-500'
                } transition-all duration-500`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className={`text-xs font-bold ${confidenceColor}`}>
              {confidencePercent}%
            </span>
          </div>

          {/* Position */}
          <div className="text-xs text-purple-300">
            Suggested position: [{suggestion.position.map(n => n.toFixed(1)).join(', ')}]
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={fetchSuggestion}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
            <button
              onClick={() => setVisible(false)}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
