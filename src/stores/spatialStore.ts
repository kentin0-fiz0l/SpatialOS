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
import { a2aService } from '../services/a2aService';

// Type assertion for a2aService to fix TypeScript errors
const a2a = a2aService as any;

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

    // Broadcast to other users
    broadcastObjectAdd(newObject);

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

    // Broadcast to other users
    broadcastObjectUpdate(id, updates);
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

    // Broadcast to other users
    broadcastObjectDelete(id);
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

// Track if we're processing a remote update (prevents broadcast loops)
let isProcessingRemote = false;

/**
 * Initialize store on app load
 */
export function initializeSpatialStore() {
  useSpatialStore.getState().loadFromDisk();
  initializeMultiUserSync();
}

/**
 * Initialize multi-user synchronization via A2A
 */
function initializeMultiUserSync() {
  const store = useSpatialStore.getState();

  // Listen for object-add messages from other users
  a2a.onMessage('object-add', (message: any) => {
    console.log('[SpatialStore] Received remote object-add:', message.payload);

    isProcessingRemote = true;
    try {
      const { object } = message.payload;
      // Add object without broadcasting (it came from remote)
      const newObjects = new Map(store.objects);
      newObjects.set(object.id, object);
      useSpatialStore.setState({ objects: newObjects });
    } finally {
      isProcessingRemote = false;
    }
  });

  // Listen for object-update messages
  a2a.onMessage('object-update', (message: any) => {
    console.log('[SpatialStore] Received remote object-update:', message.payload);

    isProcessingRemote = true;
    try {
      const { id, updates } = message.payload;
      const obj = store.objects.get(id);
      if (obj) {
        const updatedObj = { ...obj, ...updates };
        const newObjects = new Map(store.objects);
        newObjects.set(id, updatedObj);
        useSpatialStore.setState({ objects: newObjects });
      }
    } finally {
      isProcessingRemote = false;
    }
  });

  // Listen for object-delete messages
  a2a.onMessage('object-delete', (message: any) => {
    console.log('[SpatialStore] Received remote object-delete:', message.payload);

    isProcessingRemote = true;
    try {
      const { id } = message.payload;
      const newObjects = new Map(store.objects);
      newObjects.delete(id);
      useSpatialStore.setState({ objects: newObjects });
    } finally {
      isProcessingRemote = false;
    }
  });

  console.log('[SpatialStore] Multi-user sync initialized');
}

/**
 * Broadcast object addition to other users
 */
function broadcastObjectAdd(object: SpatialObject) {
  if (isProcessingRemote || !a2a.isConnected()) return;

  a2a.sendMessage({
    type: 'object-add',
    payload: { object },
  });
}

/**
 * Broadcast object update to other users
 */
function broadcastObjectUpdate(id: string, updates: Partial<SpatialObject>) {
  if (isProcessingRemote || !a2a.isConnected()) return;

  a2a.sendMessage({
    type: 'object-update',
    payload: { id, updates },
  });
}

/**
 * Broadcast object deletion to other users
 */
function broadcastObjectDelete(id: string) {
  if (isProcessingRemote || !a2a.isConnected()) return;

  a2a.sendMessage({
    type: 'object-delete',
    payload: { id },
  });
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
