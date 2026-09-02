/**
 * Spatial Object Types for SpatialOS
 *
 * All positions are in WiFi room coordinates (meters from room origin)
 */

export type SpatialObjectType = 'note' | 'timer' | 'image' | 'widget' | 'tool';

export type Vector3 = [number, number, number];
export type Quaternion = [number, number, number, number];

/**
 * Hand tracking types
 */
export type HandGesture = 'none' | 'pinch' | 'open' | 'fist' | 'point';

/**
 * Content types for different spatial objects
 */
export interface NoteContent {
  text: string;
}

export interface TimerContent {
  duration: number; // Total duration in seconds
  label?: string;
  startTime?: number; // Unix timestamp when timer started
  remainingTime?: number; // Seconds remaining (for pause/resume)
}

export interface ImageContent {
  url: string;
  width?: number;
  height?: number;
}

export interface WidgetContent {
  widgetType: 'calendar' | 'weather' | 'clock' | 'todo';
  data?: any;
}

export interface ToolContent {
  toolType: 'terminal' | 'browser' | 'calculator';
  url?: string;
  command?: string;
}

export type SpatialObjectContent =
  | NoteContent
  | TimerContent
  | ImageContent
  | WidgetContent
  | ToolContent;

/**
 * Main spatial object interface
 */
export interface SpatialObject {
  id: string; // UUID
  type: SpatialObjectType;
  content: SpatialObjectContent;

  // 3D Transform (room coordinates in meters)
  position: Vector3;
  rotation: Quaternion; // [x, y, z, w]
  scale: Vector3; // [x, y, z]

  // Metadata
  room: string; // Room ID from WiFi positioning
  createdAt: number; // Unix timestamp
  createdBy: 'voice' | 'hand'; // Creation source
  persistent: boolean; // Save to disk?
  visible: boolean; // Render in scene?
}

/**
 * Store actions interface
 */
export interface SpatialStoreState {
  // State
  objects: Map<string, SpatialObject>;
  currentRoom: string;

  // Actions
  addObject: (obj: Omit<SpatialObject, 'id' | 'createdAt'> & {
    position?: Vector3;
    rotation?: Quaternion;
    scale?: Vector3;
    room?: string;
    persistent?: boolean;
    visible?: boolean;
  }) => string;
  updateObject: (id: string, updates: Partial<SpatialObject>) => void;
  deleteObject: (id: string) => void;
  getObject: (id: string) => SpatialObject | undefined;
  getAllObjects: () => SpatialObject[];
  getObjectsByRoom: (room: string) => SpatialObject[];
  getObjectsByType: (type: SpatialObjectType) => SpatialObject[];
  clearObjects: () => void;

  // Persistence
  loadFromDisk: () => void;
  saveToDisk: () => void;

  // Room management
  setCurrentRoom: (room: string) => void;
}

/**
 * MCP command types (from MCP server)
 */
export interface MCPCommand {
  id: string;
  type: 'createObject' | 'deleteObject' | 'listObjects' | 'updateObject';
  objectType?: SpatialObjectType;
  objectId?: string;
  content?: SpatialObjectContent;
  position?: Vector3;
  filter?: { type?: SpatialObjectType };
}

/**
 * MCP response types (to MCP server)
 */
export interface MCPResponse {
  id: string;
  result?: any;
  error?: string;
}
