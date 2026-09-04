/**
 * Particle Effects Store
 *
 * Manages particle effect events triggered by hand interactions
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export interface ParticleEvent {
  id: string;
  position: [number, number, number];
  velocity?: [number, number, number];
  type: 'grab' | 'release' | 'throw';
  createdAt: number;
}

interface ParticleStoreState {
  events: ParticleEvent[];

  // Actions
  emitGrab: (position: [number, number, number]) => void;
  emitRelease: (position: [number, number, number], velocity?: [number, number, number]) => void;
  emitThrow: (position: [number, number, number], velocity: [number, number, number]) => void;
  removeEvent: (id: string) => void;
  clearEvents: () => void;
}

/**
 * Particle effects store
 */
export const useParticleStore = create<ParticleStoreState>((set) => ({
  events: [],

  // Emit grab particle burst
  emitGrab: (position) => {
    const event: ParticleEvent = {
      id: uuidv4(),
      position,
      type: 'grab',
      createdAt: Date.now(),
    };

    set((state) => ({
      events: [...state.events, event],
    }));
  },

  // Emit release particle burst
  emitRelease: (position, velocity) => {
    const event: ParticleEvent = {
      id: uuidv4(),
      position,
      velocity,
      type: 'release',
      createdAt: Date.now(),
    };

    set((state) => ({
      events: [...state.events, event],
    }));
  },

  // Emit throw particle trail
  emitThrow: (position, velocity) => {
    const event: ParticleEvent = {
      id: uuidv4(),
      position,
      velocity,
      type: 'throw',
      createdAt: Date.now(),
    };

    set((state) => ({
      events: [...state.events, event],
    }));
  },

  // Remove completed event
  removeEvent: (id) => {
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    }));
  },

  // Clear all events
  clearEvents: () => {
    set({ events: [] });
  },
}));
