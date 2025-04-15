/**
 * WakeWordDetection - A library for detecting wake words and extracting commands from speech
 */

/**
 * Log levels for controlling console output
 */
export enum LogLevel {
  NONE = "none",
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
  ALL = "all",
}

/**
 * Options for creating a WakeWordDetection instance
 */
export interface WakeWordDetectionOptions {
  /**
   * The wake word to detect (e.g., "hey agora")
   * This parameter is mandatory
   */
  wakeWord: string;

  /**
   * The language to use for speech recognition (e.g., "en-US")
   * Optional, defaults to "en-US"
   */
  language?: string;

  /**
   * Callback function that is called when the wake word is detected
   */
  onWakeWordDetected?: () => void;

  /**
   * Callback function that is called with the current transcription
   * This is called in real-time as the user speaks
   */
  onTranscription?: (transcription: string) => void;

  /**
   * Callback function that is called with the extracted command
   * This is called when the command is finalized
   */
  onCommand?: (command: string) => void;

  /**
   * Callback function that is called when an error occurs
   */
  onError?: (error: string) => void;

  /**
   * Log level for console output
   * @default "info"
   */
  logLevel?: LogLevel | string;
}

/**
 * WakeWordDetection instance
 */
export interface WakeWordDetection {
  /**
   * Start listening for the wake word
   */
  start: () => void;

  /**
   * Stop listening for the wake word
   */
  stop: () => void;

  /**
   * Pause listening for the wake word
   */
  pause: () => void;

  /**
   * Resume listening for the wake word
   */
  resume: () => void;

  /**
   * Set a new wake word
   */
  setWakeWord: (wakeWord: string) => void;

  /**
   * Set a new language
   */
  setLanguage: (language: string) => void;

  /**
   * Set the log level
   */
  setLogLevel: (logLevel: LogLevel | string) => void;

  /**
   * Check if the browser supports speech recognition
   */
  isSupported: () => boolean;
}

/**
 * Create a new WakeWordDetection instance
 */
export function createWakeWordDetection(
  options?: WakeWordDetectionOptions
): WakeWordDetection;
