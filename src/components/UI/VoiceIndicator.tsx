/**
 * Voice Indicator Component
 *
 * Shows voice recognition state and live transcript
 */

import { useIsListening, useCurrentTranscript, useVoiceError } from '../../stores/voiceStore';

export default function VoiceIndicator() {
  const isListening = useIsListening();
  const transcript = useCurrentTranscript();
  const error = useVoiceError();

  // Don't show if not listening and no error
  if (!isListening && !error) {
    return null;
  }

  return (
    <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-black/80 backdrop-blur-md rounded-2xl px-6 py-4 shadow-2xl border border-white/10 min-w-[300px] max-w-[500px]">
        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center gap-3 mb-3">
            <div className="flex gap-1">
              <div className="w-1 h-4 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-4 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-4 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm font-medium text-red-500">Listening...</span>
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <div className="text-white">
            <div className="text-xs text-gray-400 mb-1">You said:</div>
            <div className="text-base font-medium">{transcript}</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-red-400">
            <div className="text-xs text-red-300 mb-1">Error:</div>
            <div className="text-sm">{error}</div>
          </div>
        )}

        {/* Help text */}
        {isListening && !transcript && (
          <div className="text-sm text-gray-400 mt-2">
            Hold <kbd className="px-2 py-1 bg-white/10 rounded">Space</kbd> and speak...
          </div>
        )}
      </div>
    </div>
  );
}
