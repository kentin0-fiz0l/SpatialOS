/**
 * Hand Simulator Service
 *
 * Polls the hand simulator and injects simulated hand data into the hand store
 */

import { handSimulator } from './handSimulator';
import { useHandStore } from '../stores/handStore';

let intervalId: number | null = null;

/**
 * Start the hand simulator service
 */
export function startHandSimulator() {
  if (intervalId !== null) {
    console.warn('[HandSimulatorService] Already running');
    return;
  }

  // Mark simulator as active
  useHandStore.getState().setSimulatorActive(true);

  // Poll simulator state at 60 FPS
  intervalId = window.setInterval(() => {
    const handState = handSimulator.getHandState();

    if (handState) {
      // Inject simulated right hand (using right hand for now)
      useHandStore.getState().updateHand('right', {
        position: handState.position,
        gesture: handState.gesture,
        visible: handState.visible,
        confidence: handState.confidence,
      });

      // Clear left hand when simulating
      useHandStore.getState().updateHand('left', null);
    } else {
      // Simulator inactive - clear both hands
      if (!handSimulator.isActive()) {
        useHandStore.getState().updateHand('right', null);
        useHandStore.getState().updateHand('left', null);
      }
    }
  }, 16); // ~60 FPS

  console.log('[HandSimulatorService] Started');
}

/**
 * Stop the hand simulator service
 */
export function stopHandSimulator() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }

  useHandStore.getState().setSimulatorActive(false);
  handSimulator.stop();

  // Clear hands
  useHandStore.getState().updateHand('right', null);
  useHandStore.getState().updateHand('left', null);

  console.log('[HandSimulatorService] Stopped');
}

/**
 * Initialize the service (auto-start when window loads)
 */
export function initializeHandSimulator() {
  // Auto-start the polling service
  startHandSimulator();

  console.log('[HandSimulatorService] Initialized');
}
