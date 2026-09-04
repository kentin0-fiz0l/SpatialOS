/**
 * Spatial Object Store
 *
 * Central Zustand store for managing spatial objects
 * - Shared between voice commands and hand gestures
 * - Persists to localStorage
 * - Room-coordinate positioning
 */

import { create } from 'zustand';
import { useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { SpatialObject, SpatialStoreState } from '../types/spatial.types';
import { saveToLocalStorage, loadFromLocalStorage } from '../utils/persistence';

// Default position: 2 meters in front of camera, 1.5m high
const DEFAULT_POSITION: [number, number, number] = [0, 1.5, -2];
const DEFAULT_ROTATION: [number, number, number, number] = [0, 0, 0, 1];
const DEFAULT_SCALE: [number, number, number] = [1, 1, 1];

/**
 * Debounced save to localStorage
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(objects: SpatialObject[]) {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveToLocalStorage(objects);
  }, 500); // 500ms debounce
}

/**
 * Main spatial store
 */
export const useSpatialStore = create<SpatialStoreState>((set, get) => ({
  // State
  objects: new Map<string, SpatialObject>(),
  currentRoom: 'default',
  debugMode: false,

  // Add object
  addObject: (obj) => {
    const id = uuidv4();
    const newObject: SpatialObject = {
      ...obj,
      id,
      createdAt: Date.now(),
      position: obj.position || DEFAULT_POSITION,
      rotation: obj.rotation || DEFAULT_ROTATION,
      scale: obj.scale || DEFAULT_SCALE,
      room: obj.room || get().currentRoom,
      persistent: obj.persistent ?? true, // Default to persistent
      visible: obj.visible ?? true, // Default to visible
    };

    set((state) => {
      const newObjects = new Map(state.objects);
      newObjects.set(id, newObject);

      // Debounced save
      debouncedSave(Array.from(newObjects.values()));

      return { objects: newObjects };
    });

    console.log(`[SpatialStore] Added object: ${newObject.type} (${id})`);
    return id;
  },

  // Update object
  updateObject: (id, updates) => {
    set((state) => {
      const object = state.objects.get(id);
      if (!object) {
        console.warn(`[SpatialStore] Object not found: ${id}`);
        return state;
      }

      const updatedObject = { ...object, ...updates };
      const newObjects = new Map(state.objects);
      newObjects.set(id, updatedObject);

      // Debounced save
      debouncedSave(Array.from(newObjects.values()));

      return { objects: newObjects };
    });

    console.log(`[SpatialStore] Updated object: ${id}`);
  },

  // Delete object
  deleteObject: (id) => {
    set((state) => {
      const newObjects = new Map(state.objects);
      const deleted = newObjects.delete(id);

      if (!deleted) {
        console.warn(`[SpatialStore] Object not found: ${id}`);
        return state;
      }

      // Debounced save
      debouncedSave(Array.from(newObjects.values()));

      return { objects: newObjects };
    });

    console.log(`[SpatialStore] Deleted object: ${id}`);
  },

  // Get single object
  getObject: (id) => {
    return get().objects.get(id);
  },

  // Get all objects
  getAllObjects: () => {
    return Array.from(get().objects.values());
  },

  // Get objects by room
  getObjectsByRoom: (room) => {
    return Array.from(get().objects.values()).filter((obj) => obj.room === room);
  },

  // Get objects by type
  getObjectsByType: (type) => {
    return Array.from(get().objects.values()).filter((obj) => obj.type === type);
  },

  // Clear all objects
  clearObjects: () => {
    set({ objects: new Map() });
    saveToLocalStorage([]);
    console.log('[SpatialStore] Cleared all objects');
  },

  // Load from disk
  loadFromDisk: () => {
    const savedObjects = loadFromLocalStorage();
    const objectsMap = new Map<string, SpatialObject>();

    savedObjects.forEach((obj) => {
      objectsMap.set(obj.id, obj);
    });

    set({ objects: objectsMap });
    console.log(`[SpatialStore] Loaded ${savedObjects.length} objects from disk`);
  },

  // Save to disk (immediate)
  saveToDisk: () => {
    const objects = Array.from(get().objects.values());
    saveToLocalStorage(objects);
  },

  // Set current room
  setCurrentRoom: (room) => {
    set({ currentRoom: room });
    console.log(`[SpatialStore] Current room: ${room}`);
  },

  // Set debug mode
  setDebugMode: (enabled) => {
    set({ debugMode: enabled });
    console.log(`[SpatialStore] Debug mode: ${enabled ? 'enabled' : 'disabled'}`);
  },
}));

/**
 * Initialize store on app load
 */
export function initializeSpatialStore() {
  useSpatialStore.getState().loadFromDisk();
}

/**
 * Helper selectors
 */

// Get visible objects in current room (memoized to prevent infinite loops)
export const useVisibleObjects = () => {
  const objects = useSpatialStore((state) => state.objects);
  const currentRoom = useSpatialStore((state) => state.currentRoom);

  // Use useMemo to avoid creating new array every render
  return useMemo(
    () =>
      Array.from(objects.values()).filter(
        (obj) => obj.visible && obj.room === currentRoom
      ),
    [objects, currentRoom]
  );
};

// Get objects by type in current room (memoized to prevent infinite loops)
export const useObjectsByType = (type: SpatialObject['type']) => {
  const objects = useSpatialStore((state) => state.objects);
  const currentRoom = useSpatialStore((state) => state.currentRoom);

  return useMemo(
    () =>
      Array.from(objects.values()).filter(
        (obj) => obj.type === type && obj.room === currentRoom
      ),
    [objects, currentRoom, type]
  );
};

// Get object count
export const useObjectCount = () =>
  useSpatialStore((state) => state.objects.size);
