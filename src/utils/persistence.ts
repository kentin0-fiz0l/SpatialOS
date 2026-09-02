/**
 * Persistence utilities for spatial objects
 *
 * Saves/loads spatial objects to/from localStorage with room coordinates
 */

import type { SpatialObject } from '../types/spatial.types';

const STORAGE_KEY = 'spatialos:objects';
const STORAGE_VERSION = 1;

interface StorageData {
  version: number;
  objects: SpatialObject[];
  timestamp: number;
}

/**
 * Save objects to localStorage
 */
export function saveToLocalStorage(objects: SpatialObject[]): void {
  try {
    // Filter only persistent objects
    const persistentObjects = objects.filter((obj) => obj.persistent);

    const data: StorageData = {
      version: STORAGE_VERSION,
      objects: persistentObjects,
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log(`[Persistence] Saved ${persistentObjects.length} objects to localStorage`);
  } catch (error) {
    console.error('[Persistence] Failed to save to localStorage:', error);
  }
}

/**
 * Load objects from localStorage
 */
export function loadFromLocalStorage(): SpatialObject[] {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (!item) {
      console.log('[Persistence] No saved objects found');
      return [];
    }

    const data: StorageData = JSON.parse(item);

    // Version check (for future migrations)
    if (data.version !== STORAGE_VERSION) {
      console.warn('[Persistence] Storage version mismatch, clearing old data');
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    console.log(`[Persistence] Loaded ${data.objects.length} objects from localStorage`);
    return data.objects;
  } catch (error) {
    console.error('[Persistence] Failed to load from localStorage:', error);
    return [];
  }
}

/**
 * Clear all saved objects
 */
export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Persistence] Cleared localStorage');
  } catch (error) {
    console.error('[Persistence] Failed to clear localStorage:', error);
  }
}

/**
 * Export objects as JSON file
 */
export function exportToJSON(objects: SpatialObject[]): void {
  try {
    const data: StorageData = {
      version: STORAGE_VERSION,
      objects,
      timestamp: Date.now(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spatialos-objects-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[Persistence] Exported ${objects.length} objects to JSON`);
  } catch (error) {
    console.error('[Persistence] Failed to export to JSON:', error);
  }
}

/**
 * Import objects from JSON file
 */
export async function importFromJSON(file: File): Promise<SpatialObject[]> {
  try {
    const text = await file.text();
    const data: StorageData = JSON.parse(text);

    if (data.version !== STORAGE_VERSION) {
      throw new Error('Incompatible file version');
    }

    console.log(`[Persistence] Imported ${data.objects.length} objects from JSON`);
    return data.objects;
  } catch (error) {
    console.error('[Persistence] Failed to import from JSON:', error);
    throw error;
  }
}
