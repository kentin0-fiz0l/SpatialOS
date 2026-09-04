/**
 * Voice Service
 *
 * Handles speech recognition and voice command processing
 * Uses Web Speech API for browser-based speech-to-text
 */

export type VoiceCommand =
  | { type: 'create_note'; text: string }
  | { type: 'create_timer'; duration: number; label?: string }
  | { type: 'create_image'; url: string }
  | { type: 'create_widget'; widgetType: string }
  | { type: 'delete_all' }
  | { type: 'unknown'; rawText: string };

/**
 * Voice Service using Web Speech API
 */
export class VoiceService {
  private recognition: any = null;
  private isListening: boolean = false;
  private onCommandCallback: ((command: VoiceCommand) => void) | null = null;
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Web Speech API
   */
  private initialize() {
    // Check if browser supports Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[Voice] Web Speech API not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false; // Stop after one phrase (PTT mode)
    this.recognition.interimResults = true; // Show interim results
    this.recognition.lang = 'en-US';

    // Handle speech results
    this.recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult[0].transcript;
      const isFinal = lastResult.isFinal;

      console.log(`[Voice] ${isFinal ? 'Final' : 'Interim'}: "${transcript}"`);

      // Send transcript to callback
      if (this.onTranscriptCallback) {
        this.onTranscriptCallback(transcript, isFinal);
      }

      // Parse command if final
      if (isFinal) {
        const command = this.parseCommand(transcript);
        if (this.onCommandCallback) {
          this.onCommandCallback(command);
        }
      }
    };

    // Handle errors
    this.recognition.onerror = (event: any) => {
      console.error('[Voice] Recognition error:', event.error);
      this.isListening = false;
    };

    // Handle end
    this.recognition.onend = () => {
      console.log('[Voice] Recognition ended');
      this.isListening = false;
    };

    console.log('[Voice] Speech recognition initialized');
  }

  /**
   * Start listening (PTT mode)
   */
  startListening() {
    if (!this.recognition) {
      console.warn('[Voice] Speech recognition not available');
      return;
    }

    if (this.isListening) {
      console.warn('[Voice] Already listening');
      return;
    }

    try {
      this.recognition.start();
      this.isListening = true;
      console.log('[Voice] Started listening');
    } catch (error) {
      console.error('[Voice] Failed to start listening:', error);
    }
  }

  /**
   * Stop listening
   */
  stopListening() {
    if (!this.recognition || !this.isListening) {
      return;
    }

    try {
      this.recognition.stop();
      this.isListening = false;
      console.log('[Voice] Stopped listening');
    } catch (error) {
      console.error('[Voice] Failed to stop listening:', error);
    }
  }

  /**
   * Parse voice transcript into command
   */
  private parseCommand(text: string): VoiceCommand {
    const lower = text.toLowerCase().trim();

    // Create note: "create a note <text>" or "note <text>"
    const noteMatch = lower.match(/(?:create (?:a )?note|note)\s+(.+)/);
    if (noteMatch) {
      return { type: 'create_note', text: noteMatch[1] };
    }

    // Create timer: "set a timer for <number> <unit>" or "timer <number> <unit>"
    const timerMatch = lower.match(/(?:set (?:a )?timer (?:for )?|timer)\s*(\d+)\s*(second|seconds|minute|minutes|hour|hours)?/);
    if (timerMatch) {
      const value = parseInt(timerMatch[1]);
      const unit = timerMatch[2] || 'seconds';

      let duration = value;
      if (unit.startsWith('minute')) duration *= 60;
      if (unit.startsWith('hour')) duration *= 3600;

      return { type: 'create_timer', duration, label: `${value} ${unit}` };
    }

    // Create image: "show me an image <url>" or "image <url>"
    const imageMatch = lower.match(/(?:show (?:me )?(?:an? )?image|image)\s+(.+)/);
    if (imageMatch) {
      return { type: 'create_image', url: imageMatch[1] };
    }

    // Create widget: "create a <type> widget" or "widget <type>"
    const widgetMatch = lower.match(/(?:create (?:a )?|widget\s+)(clock|weather|calendar|todo)(?:\s+widget)?/);
    if (widgetMatch) {
      return { type: 'create_widget', widgetType: widgetMatch[1] };
    }

    // Delete all: "delete everything" or "clear all"
    if (lower.match(/(?:delete|clear|remove)\s+(?:everything|all)/)) {
      return { type: 'delete_all' };
    }

    // Unknown command
    return { type: 'unknown', rawText: text };
  }

  /**
   * Register callback for voice commands
   */
  onCommand(callback: (command: VoiceCommand) => void) {
    this.onCommandCallback = callback;
  }

  /**
   * Register callback for transcripts (live updates)
   */
  onTranscript(callback: (text: string, isFinal: boolean) => void) {
    this.onTranscriptCallback = callback;
  }

  /**
   * Check if speech recognition is available
   */
  isAvailable(): boolean {
    return this.recognition !== null;
  }

  /**
   * Get listening state
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}

// Singleton instance
let voiceService: VoiceService | null = null;

/**
 * Get voice service instance
 */
export function getVoiceService(): VoiceService {
  if (!voiceService) {
    voiceService = new VoiceService();
  }
  return voiceService;
}
