/**
 * Ollama Service
 *
 * HTTP client for local Ollama AI inference
 * Builds context-aware prompts from spatial data + spatial memories
 */

import type { Vector3 } from '../types/spatial.types';
import type { SpatialMemory } from '../stores/spatialMemoryStore';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface SpatialObject {
  id: string;
  type: string;
  position: Vector3;
  color?: string;
}

class OllamaService {
  private baseURL: string;
  private model: string;
  private timeout: number;

  constructor(
    baseURL: string = 'http://localhost:11434',
    model: string = 'llama3.1:8b',
    timeout: number = 30000
  ) {
    this.baseURL = baseURL;
    this.model = model;
    this.timeout = timeout;
  }

  /**
   * Test connection to Ollama server
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error('[OllamaService] Ping failed:', error);
      return false;
    }
  }

  /**
   * Query Ollama with a prompt
   */
  async query(prompt: string): Promise<string> {
    try {
      console.log('[OllamaService] Querying with prompt:', prompt.substring(0, 100) + '...');
      const startTime = Date.now();

      const response = await this.fetchGenerate(prompt);

      const elapsed = Date.now() - startTime;
      console.log(`[OllamaService] Response received in ${elapsed}ms`);

      return response;
    } catch (error) {
      console.error('[OllamaService] Query failed:', error);
      throw new Error(`Failed to query Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build a spatial-aware prompt from hand position, nearby objects, and spatial memories
   */
  buildSpatialPrompt(handPos: Vector3, nearbyObjects: SpatialObject[], nearbyMemories: SpatialMemory[] = []): string {

    // Build object descriptions
    const objectDescriptions = nearbyObjects
      .slice(0, 3) // Limit to 3 closest objects
      .map((obj) => {
        const distance = this.calculateDistance(handPos, obj.position);
        const colorDesc = obj.color ? `${obj.color} ` : '';
        return `- A ${colorDesc}${obj.type} at [${obj.position[0].toFixed(2)}, ${obj.position[1].toFixed(2)}, ${obj.position[2].toFixed(2)}], ${distance.toFixed(2)}m away`;
      })
      .join('\n');

    // Build memory descriptions
    const memoryDescriptions = nearbyMemories
      .slice(0, 3) // Limit to 3 closest memories
      .map((memory) => {
        const distance = this.calculateDistance(handPos, memory.position);
        const desc = memory.description ? ` (${memory.description})` : '';
        return `- "${memory.label}" at [${memory.position[0].toFixed(2)}, ${memory.position[1].toFixed(2)}, ${memory.position[2].toFixed(2)}], ${distance.toFixed(2)}m away${desc}`;
      })
      .join('\n');

    // Build the prompt with both objects and memories
    let prompt = `You are an AI assistant integrated into a 3D spatial computing environment with spatial memory.

The user made a fist gesture at position [${handPos[0].toFixed(2)}, ${handPos[1].toFixed(2)}, ${handPos[2].toFixed(2)}].
`;

    // Add objects section if any exist
    if (objectDescriptions) {
      prompt += `\nNearby objects:\n${objectDescriptions}\n`;
    }

    // Add memories section if any exist
    if (memoryDescriptions) {
      prompt += `\nSpatial memories (locations you've been told to remember):\n${memoryDescriptions}\n`;
    }

    // Handle case where nothing is nearby
    if (!objectDescriptions && !memoryDescriptions) {
      prompt += `\nThere are no objects or spatial memories nearby.\n`;
    }

    prompt += `\nRespond in 1-2 sentences describing what you observe in this spatial area. Be natural and conversational. If there are spatial memories, reference them by name (e.g., "near your desk").`;

    return prompt;
  }

  /**
   * Calculate distance between two 3D points
   */
  private calculateDistance(a: Vector3, b: Vector3): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Make HTTP request to Ollama /api/generate endpoint
   */
  private async fetchGenerate(prompt: string): Promise<string> {
    const requestBody: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false, // Non-streaming for MVP
      options: {
        temperature: 0.7,
        num_predict: 150, // Keep responses concise
        top_p: 0.9,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data: OllamaGenerateResponse = await response.json();
      return data.response.trim();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Configure the model to use
   */
  setModel(model: string) {
    this.model = model;
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }
}

// Export singleton instance
export const ollamaService = new OllamaService();

// Export class for testing
export { OllamaService };
