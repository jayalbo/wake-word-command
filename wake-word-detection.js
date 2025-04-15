/**
 * WakeWordDetection - A library for detecting wake words and extracting commands from speech
 */

/**
 * Log levels for controlling console output
 * @enum {string}
 */
export const LogLevel = {
  NONE: "none",
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
  ALL: "all",
};

/**
 * Create a new WakeWordDetection instance
 * @param {Object} options - Configuration options
 * @param {string} options.wakeWord - The wake word to detect (mandatory)
 * @param {string} [options.language="en-US"] - The language to use for speech recognition
 * @param {Function} [options.onWakeWordDetected] - Callback when wake word is detected
 * @param {Function} [options.onTranscription] - Callback with current transcription
 * @param {Function} [options.onCommand] - Callback with extracted command
 * @param {Function} [options.onError] - Callback when an error occurs
 * @param {string} [options.logLevel="info"] - Log level for console output (none, error, warn, info, debug, all)
 * @returns {Object} WakeWordDetection instance
 * @throws {Error} If wakeWord is not provided
 */
export function createWakeWordDetection(options = {}) {
  // Validate required options
  if (!options.wakeWord) {
    throw new Error("Wake word is required");
  }

  // Default options
  const config = {
    wakeWord: options.wakeWord.toLowerCase(),
    language: options.language || "en-US",
    onWakeWordDetected: options.onWakeWordDetected || (() => {}),
    onTranscription: options.onTranscription || (() => {}),
    onCommand: options.onCommand || (() => {}),
    onError: options.onError || (() => {}),
    logLevel: options.logLevel || LogLevel.INFO,
  };

  // Internal state
  let recognition = null;
  let isListening = false;
  let isPaused = false;
  let lastWakeWordTime = 0;
  let currentCommand = "";
  let isCommandComplete = false;
  let wakeWordDetected = false;
  let commandTimeout = null;
  let lastTranscriptTime = 0;
  let fullTranscript = "";
  let lastErrorTime = 0;
  let lastProcessedCommand = "";
  let isProcessingCommand = false;
  let interimTranscript = "";
  let restartTimeout = null;
  const COMMAND_TIMEOUT_MS = 2000;
  const WAKE_WORD_COOLDOWN_MS = 2000;
  const ERROR_COOLDOWN_MS = 1000;
  const MIN_COMMAND_LENGTH = 5;
  const MAX_RESTART_ATTEMPTS = 5;
  const RESTART_DELAY_MS = 1000;
  let restartAttempts = 0;

  /**
   * Logger function that respects the configured log level
   * @param {string} level - The log level (error, warn, info, debug)
   * @param {string} message - The message to log
   * @param {any} [data] - Optional data to log
   */
  function log(level, message, data) {
    // Map log levels to console methods
    const logMethods = {
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };

    // Check if we should log based on configured level
    const shouldLog = shouldLogLevel(level, config.logLevel);

    if (shouldLog && logMethods[level]) {
      if (data !== undefined) {
        logMethods[level](message, data);
      } else {
        logMethods[level](message);
      }
    }
  }

  /**
   * Determine if a log level should be displayed based on the configured level
   * @param {string} level - The log level to check
   * @param {string} configuredLevel - The configured log level
   * @returns {boolean} Whether the log should be displayed
   */
  function shouldLogLevel(level, configuredLevel) {
    if (configuredLevel === LogLevel.NONE) return false;
    if (configuredLevel === LogLevel.ALL) return true;

    const levels = [
      LogLevel.ERROR,
      LogLevel.WARN,
      LogLevel.INFO,
      LogLevel.DEBUG,
    ];
    const configuredIndex = levels.indexOf(configuredLevel);
    const levelIndex = levels.indexOf(level);

    return levelIndex <= configuredIndex;
  }

  /**
   * Initialize speech recognition
   */
  function initializeSpeechRecognition() {
    try {
      // Check if browser supports speech recognition
      if (
        !("webkitSpeechRecognition" in window) &&
        !("SpeechRecognition" in window)
      ) {
        throw new Error("Speech recognition not supported in this browser");
      }

      // Create speech recognition instance
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();

      // Configure recognition settings
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = config.language;

      // Handle recognition results
      recognition.onresult = (event) => {
        // Reset restart attempts on successful result
        restartAttempts = 0;

        const results = Array.from(event.results);
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript;
        const isFinal = lastResult.isFinal;
        const now = Date.now();

        // Normalize the transcript
        const normalizedTranscript = transcript.trim().toLowerCase();

        log("debug", `Transcript: "${transcript}" (isFinal: ${isFinal})`);

        // Check if the transcript contains the wake word
        const containsWakeWord = normalizedTranscript.includes(
          config.wakeWord.toLowerCase()
        );
        log(
          "debug",
          `Contains wake word "${config.wakeWord}": ${containsWakeWord}`
        );

        if (containsWakeWord && !isProcessingCommand) {
          // Only process if we're not already handling a command and enough time has passed
          if (now - lastWakeWordTime > WAKE_WORD_COOLDOWN_MS) {
            log("info", "New wake word detected!");
            lastWakeWordTime = now;
            isCommandComplete = false;
            wakeWordDetected = true;
            isProcessingCommand = true;
            fullTranscript = transcript;
            interimTranscript = "";

            // Clear any existing command timeout
            if (commandTimeout) {
              clearTimeout(commandTimeout);
              commandTimeout = null;
            }

            // Call the wake word detected callback
            config.onWakeWordDetected();

            // Extract the command (everything after the wake word)
            const commandText = extractCommandText(transcript);
            log("info", `Extracted command: "${commandText}"`);

            if (commandText && commandText.length >= MIN_COMMAND_LENGTH) {
              currentCommand = commandText;
              interimTranscript = commandText;
              config.onTranscription(commandText);
            }

            // Set a timeout to finalize the command if no more speech is detected
            commandTimeout = setTimeout(() => {
              if (!isCommandComplete && wakeWordDetected) {
                log("info", "Command finalized by timeout!");
                finalizeCommand();
              }
            }, COMMAND_TIMEOUT_MS);
          }
        } else if (wakeWordDetected && !isCommandComplete) {
          // Update the full transcript if it's a continuation of the current command
          if (transcript.length > fullTranscript.length) {
            fullTranscript = transcript;
            const commandText = extractCommandText(fullTranscript);
            log("debug", `Updating command: "${commandText}"`);

            if (
              commandText &&
              commandText.length >= MIN_COMMAND_LENGTH &&
              commandText !== interimTranscript
            ) {
              currentCommand = commandText;
              interimTranscript = commandText;
              lastTranscriptTime = now;
              config.onTranscription(commandText);
            }

            // Reset the timeout
            if (commandTimeout) {
              clearTimeout(commandTimeout);
            }

            commandTimeout = setTimeout(() => {
              if (!isCommandComplete && wakeWordDetected) {
                log("info", "Command finalized by timeout!");
                finalizeCommand();
              }
            }, COMMAND_TIMEOUT_MS);
          }
        }

        // If this is a final result and we have a wake word detected, finalize the command
        if (isFinal && wakeWordDetected && !isCommandComplete) {
          log("info", "Command finalized by isFinal!");
          finalizeCommand();
        }
      };

      // Handle recognition errors
      recognition.onerror = (event) => {
        log("error", "Speech recognition error:", event.error);

        // Ignore no-speech errors if they happen too frequently
        if (event.error === "no-speech") {
          const now = Date.now();
          if (now - lastErrorTime < ERROR_COOLDOWN_MS) {
            log("debug", "Ignoring frequent no-speech error");
            return;
          }
          lastErrorTime = now;
        }

        config.onError(`Error: ${event.error}`);

        // Handle specific errors that require restart
        if (["no-speech", "audio-capture", "network"].includes(event.error)) {
          restartRecognition();
        }
      };

      // Handle recognition end
      recognition.onend = () => {
        if (isListening && !isPaused) {
          restartRecognition();
        }
      };

      return true;
    } catch (error) {
      log("error", "Error initializing speech recognition:", error);
      config.onError(`Error initializing speech recognition: ${error.message}`);
      return false;
    }
  }

  /**
   * Restart speech recognition with exponential backoff
   */
  function restartRecognition() {
    if (restartTimeout) {
      clearTimeout(restartTimeout);
    }

    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
      log("warn", "Max restart attempts reached, stopping recognition");
      stop();
      return;
    }

    const delay = RESTART_DELAY_MS * Math.pow(2, restartAttempts);
    log(
      "info",
      `Restarting recognition in ${delay}ms (attempt ${
        restartAttempts + 1
      }/${MAX_RESTART_ATTEMPTS})`
    );

    restartTimeout = setTimeout(() => {
      try {
        if (recognition) {
          recognition.stop();
        }
        if (initializeSpeechRecognition()) {
          recognition.start();
          restartAttempts++;
        }
      } catch (error) {
        log("error", "Error restarting recognition:", error);
        config.onError(`Error restarting recognition: ${error.message}`);
      }
    }, delay);
  }

  /**
   * Finalize the current command
   */
  function finalizeCommand() {
    if (!isCommandComplete && wakeWordDetected) {
      isCommandComplete = true;
      wakeWordDetected = false;
      isProcessingCommand = false;

      if (commandTimeout) {
        clearTimeout(commandTimeout);
        commandTimeout = null;
      }

      const finalCommand = extractCommandText(fullTranscript);

      // Only process if this is a new command, it's not empty, and meets minimum length
      if (
        finalCommand &&
        finalCommand !== lastProcessedCommand &&
        finalCommand.length >= MIN_COMMAND_LENGTH
      ) {
        lastProcessedCommand = finalCommand;
        config.onCommand(finalCommand);
      }

      // Reset state
      currentCommand = "";
      fullTranscript = "";
      interimTranscript = "";
    }
  }

  /**
   * Extract command text (remove wake word and everything before it)
   * @param {string} text - The text to extract the command from
   * @returns {string} The extracted command
   */
  function extractCommandText(text) {
    // Normalize the text by trimming and converting to lowercase
    const normalizedText = text.trim().toLowerCase();
    const normalizedWakeWord = config.wakeWord.trim().toLowerCase();

    // Find the position of the wake word
    const wakeWordIndex = normalizedText.indexOf(normalizedWakeWord);
    log("debug", `Wake word index: ${wakeWordIndex}`);

    // If wake word found in current text, get everything after it
    if (wakeWordIndex !== -1) {
      return normalizedText
        .substring(wakeWordIndex + normalizedWakeWord.length)
        .trim();
    }

    // If no wake word found but we're in a command, return the current command
    if (wakeWordDetected && currentCommand) {
      return currentCommand;
    }

    // Otherwise return empty string
    return "";
  }

  /**
   * Start listening for the wake word
   */
  function start() {
    try {
      // Initialize recognition if not already initialized
      if (!recognition) {
        if (!initializeSpeechRecognition()) {
          return;
        }
      }

      // Clear previous state
      currentCommand = "";
      isCommandComplete = false;
      isPaused = false;
      wakeWordDetected = false;
      log("info", `Starting with wake word: "${config.wakeWord}"`);

      // Start recognition
      recognition.start();
      isListening = true;
    } catch (error) {
      log("error", "Error starting speech recognition:", error);
      config.onError(`Error starting speech recognition: ${error.message}`);
    }
  }

  /**
   * Stop listening for the wake word
   */
  function stop() {
    if (recognition) {
      recognition.stop();
      isListening = false;
      isPaused = false;
    }
  }

  /**
   * Pause listening for the wake word
   */
  function pause() {
    if (recognition && isListening) {
      recognition.stop();
      isPaused = true;
    }
  }

  /**
   * Resume listening for the wake word
   */
  function resume() {
    if (recognition && isPaused) {
      recognition.start();
      isPaused = false;
    }
  }

  /**
   * Set a new wake word
   * @param {string} wakeWord - The new wake word
   */
  function setWakeWord(wakeWord) {
    config.wakeWord = wakeWord.toLowerCase().trim();
    log("info", `Wake word set to: "${config.wakeWord}"`);
  }

  /**
   * Set a new language
   * @param {string} language - The new language
   */
  function setLanguage(language) {
    config.language = language;
    if (recognition) {
      recognition.lang = language;
    }
  }

  /**
   * Set the log level
   * @param {string} logLevel - The new log level (none, error, warn, info, debug, all)
   */
  function setLogLevel(logLevel) {
    if (Object.values(LogLevel).includes(logLevel)) {
      config.logLevel = logLevel;
      log("info", `Log level set to: ${logLevel}`);
    } else {
      log(
        "warn",
        `Invalid log level: ${logLevel}. Using default: ${LogLevel.INFO}`
      );
    }
  }

  /**
   * Check if the browser supports speech recognition
   * @returns {boolean} True if speech recognition is supported
   */
  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // Return the public API
  return {
    start,
    stop,
    pause,
    resume,
    setWakeWord,
    setLanguage,
    setLogLevel,
    isSupported,
  };
}
