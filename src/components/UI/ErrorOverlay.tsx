/**
 * Error Overlay Component
 *
 * Displays error messages with visual feedback
 * - Hand tracking errors
 * - Voice recognition errors
 * - Object creation errors
 * - AI query errors
 */

import { useEffect, useState } from 'react';
import { useHandStore } from '../../stores/handStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAIError } from '../../stores/aiStore';

interface ErrorMessage {
  id: string;
  type: 'hand' | 'voice' | 'object' | 'ai';
  message: string;
  timestamp: number;
}

export default function ErrorOverlay() {
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const handTrackingActive = useHandStore((state) => state.trackingActive);
  const cameraActive = useHandStore((state) => state.cameraActive);
  const voiceError = useVoiceStore((state) => state.error);
  const aiError = useAIError();

  // Hand tracking error detection
  useEffect(() => {
    // If camera is active but tracking is not, show error
    if (cameraActive && !handTrackingActive) {
      const errorId = `hand-${Date.now()}`;
      setErrors((prev) => [
        ...prev,
        {
          id: errorId,
          type: 'hand',
          message: 'Hand tracking lost. Show your hands to the camera.',
          timestamp: Date.now(),
        },
      ]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setErrors((prev) => prev.filter((e) => e.id !== errorId));
      }, 5000);
    }
  }, [cameraActive, handTrackingActive]);

  // Voice error
  useEffect(() => {
    if (voiceError) {
      const errorId = `voice-${Date.now()}`;
      setErrors((prev) => [
        ...prev,
        {
          id: errorId,
          type: 'voice',
          message: voiceError,
          timestamp: Date.now(),
        },
      ]);

      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        setErrors((prev) => prev.filter((e) => e.id !== errorId));
      }, 3000);
    }
  }, [voiceError]);

  // AI error
  useEffect(() => {
    if (aiError) {
      const errorId = `ai-${Date.now()}`;
      setErrors((prev) => [
        ...prev,
        {
          id: errorId,
          type: 'ai',
          message: `AI Error: ${aiError}`,
          timestamp: Date.now(),
        },
      ]);

      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        setErrors((prev) => prev.filter((e) => e.id !== errorId));
      }, 4000);
    }
  }, [aiError]);

  // Remove errors manually
  const dismissError = (id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  };

  if (errors.length === 0) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {errors.map((error) => (
        <div
          key={error.id}
          className="bg-red-500/90 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slideDown pointer-events-auto"
          onClick={() => dismissError(error.id)}
        >
          {/* Error icon based on type */}
          <div className="flex-shrink-0">
            {error.type === 'hand' && <span className="text-2xl">✋</span>}
            {error.type === 'voice' && <span className="text-2xl">🎤</span>}
            {error.type === 'object' && <span className="text-2xl">⚠️</span>}
            {error.type === 'ai' && <span className="text-2xl">🤖</span>}
          </div>

          {/* Error message */}
          <div className="flex-1">
            <p className="text-sm font-semibold">{error.message}</p>
          </div>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismissError(error.id);
            }}
            className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      ))}

      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
