/**
 * Webcam Feed Component
 *
 * Displays webcam feed and initializes hand tracking
 */

import { useEffect, useRef, useState } from 'react';
import { initializeHandTracking, getHandTrackingService } from '../../services/handTracking';
import { useTrackingActive } from '../../stores/handStore';

export default function WebcamFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const trackingActive = useTrackingActive();

  const initialized = useRef(false);

  useEffect(() => {
    if (!videoRef.current || initialized.current) return;

    // Initialize hand tracking (only once!)
    const init = async () => {
      try {
        initialized.current = true;
        await initializeHandTracking(videoRef.current!);
      } catch (err) {
        console.error('[WebcamFeed] Failed to initialize:', err);
        setError('Failed to access webcam. Please allow camera access.');
        initialized.current = false;
      }
    };

    init();

    // Cleanup
    return () => {
      const service = getHandTrackingService();
      if (service) {
        service.stop();
        initialized.current = false;
      }
    };
  }, []);

  if (error) {
    return (
      <div className="absolute top-20 right-4 z-10 bg-red-500/90 backdrop-blur-sm rounded-lg p-4 max-w-xs">
        <h3 className="font-bold mb-2">Camera Error</h3>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 px-3 py-1 bg-white text-red-500 rounded text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={`absolute top-20 right-4 z-10 transition-all duration-300 ${
        isMinimized ? 'w-16 h-12' : 'w-64 h-48'
      }`}
    >
      {/* Video feed */}
      <div className="relative bg-black rounded-lg overflow-hidden shadow-lg border-2 border-gray-700">
        <video
          ref={videoRef}
          className="w-full h-full object-cover transform -scale-x-100"
          autoPlay
          playsInline
          muted
        />

        {/* Status indicator */}
        <div className="absolute top-2 left-2">
          <div
            className={`w-2 h-2 rounded-full ${
              trackingActive ? 'bg-green-400' : 'bg-red-400'
            } animate-pulse`}
          />
        </div>

        {/* Minimize/maximize button */}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded text-xs hover:bg-black/70 transition-colors"
        >
          {isMinimized ? '□' : '−'}
        </button>

        {/* Hand tracking status (when expanded) */}
        {!isMinimized && (
          <div className="absolute bottom-2 left-2 text-xs bg-black/50 backdrop-blur-sm rounded px-2 py-1">
            {trackingActive ? (
              <span className="text-green-400">Tracking Active</span>
            ) : (
              <span className="text-gray-400">Starting...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
