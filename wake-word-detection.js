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
 * @param {Function} [options.onCommandTimeout] - Callback when command timeout occurs
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
    onCommandTimeout: options.onCommandTimeout || (() => {}),
    logLevel: options.logLevel || LogLevel.INFO,
    commandTimeoutMs: options.commandTimeoutMs || 3000,
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
  let fullTranscript = "";
  let lastErrorTime = 0;
  let isProcessingCommand = false;
  let interimTranscript = "";
  let restartTimeout = null;
  let isStopping = false; // Track if we're in the process of stopping
  let pendingRestart = false; // Track if we need to restart after stopping
  let inactivityTimeout = null; // Track inactivity timeout
  let commandBuffer = ""; // Buffer for quick commands
  let commandStartTime = 0; // Track when command listening started
  let commandMode = false; // Explicitly track if we're in command mode
  let lastTranscript = ""; // Store the last transcript for comparison
  let countdownInterval = null; // Track the countdown interval
  let waitingForNextFinal = false; // Track if we're waiting for the next isFinal event
  const WAKE_WORD_COOLDOWN_MS = 2000;
  const ERROR_COOLDOWN_MS = 1000;
  const MIN_COMMAND_LENGTH = 1; // Allow single-word commands like "Hi" or "Hello"
  const MAX_RESTART_ATTEMPTS = 5;
  const RESTART_DELAY_MS = 1000;
  const INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds of inactivity before auto-restart
  const QUICK_COMMAND_BUFFER_MS = 1000; // Buffer time for quick commands
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

        // Reset inactivity timeout
        resetInactivityTimeout();

        const results = Array.from(event.results);
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript;
        const isFinal = lastResult.isFinal;
        const now = Date.now();

        // Normalize the transcript
        const normalizedTranscript = transcript.trim().toLowerCase();
        const normalizedWakeWord = config.wakeWord.toLowerCase();

        log("debug", `Transcript: "${transcript}" (isFinal: ${isFinal})`);

        // Check if the transcript contains the wake word
        const containsWakeWord =
          normalizedTranscript.includes(normalizedWakeWord);

        // Trigger wake word detected callback
        if (containsWakeWord) config.onWakeWordDetected();

        log(
          "debug",
          `Contains wake word "${config.wakeWord}": ${containsWakeWord}`
        );

        // CASE 1: Wake word detected in a final result
        if (containsWakeWord && isFinal && !isProcessingCommand) {
          // Only process if we're not already handling a command and enough time has passed
          if (now - lastWakeWordTime > WAKE_WORD_COOLDOWN_MS) {
            log("info", "New wake word detected!");
            lastWakeWordTime = now;
            isCommandComplete = false;
            wakeWordDetected = true;
            isProcessingCommand = true;
            commandMode = true;

            // // Call the wake word detected callback
            // config.onWakeWordDetected();

            // Check if the transcript is ONLY the wake word
            const isOnlyWakeWord =
              normalizedTranscript.trim() === normalizedWakeWord;

            if (isOnlyWakeWord) {
              // If it's only the wake word, wait for the next isFinal event
              log(
                "info",
                "Wake word only detected, waiting for next command..."
              );
              waitingForNextFinal = true;
              startCommandListening();
            } else {
              // If it contains more than just the wake word, extract the command
              const commandText = extractCommandText(transcript);
              log("info", `Extracted command: "${commandText}"`);

              if (commandText && commandText.length >= MIN_COMMAND_LENGTH) {
                currentCommand = commandText;
                interimTranscript = commandText;
                config.onTranscription(commandText);

                // Process the command directly
                processCommand(commandText);
              } else {
                // No valid command, go back to listening for wake word
                log("info", "No valid command detected after wake word");
                resetToWakeWordListening();
              }
            }
          }
        }
        // CASE 2: We're waiting for the next isFinal event after wake word
        else if (waitingForNextFinal && isFinal) {
          log("debug", "Received next isFinal event after wake word");

          // Store the transcript
          fullTranscript = transcript;
          lastTranscript = transcript;

          // Use this transcript as the command
          const commandText = transcript.trim();

          if (commandText && commandText.length >= MIN_COMMAND_LENGTH) {
            log("info", `Command detected: "${commandText}"`);
            currentCommand = commandText;
            interimTranscript = commandText;
            config.onTranscription(commandText);

            // Process the command directly instead of calling finalizeCommand
            processCommand(commandText);
          } else {
            // No valid command, go back to listening for wake word
            log("info", "No valid command detected after wake word");
            resetToWakeWordListening();
          }
        }
        // CASE 3: We're in command mode and received a new transcript (not final)
        else if (wakeWordDetected && !isCommandComplete && !isFinal) {
          // Update the interim transcript for display
          interimTranscript = transcript;
          config.onTranscription(transcript);

          // If we're waiting for a command and the user starts talking, pause the timeout
          if (waitingForNextFinal) {
            log("debug", "User started talking, pausing command timeout");
            pauseCommandTimeout();
          }
        }
      };

      // Handle recognition errors
      recognition.onerror = (event) => {
        log("error", "Speech recognition error:", event.error);

        // Handle no-speech errors differently
        if (event.error === "no-speech") {
          const now = Date.now();
          if (now - lastErrorTime < ERROR_COOLDOWN_MS) {
            log("debug", "Ignoring frequent no-speech error");
            return;
          }
          lastErrorTime = now;

          // For no-speech errors, we'll let the onend handler restart it
          // This is more reliable than treating it as a critical error
          log("info", "No speech detected, will restart on end");
          return;
        }

        config.onError(`Error: ${event.error}`);

        // Handle specific errors that require restart
        if (["audio-capture", "network"].includes(event.error)) {
          log("info", "Restarting recognition:", event.info);
          restartRecognition();
        }
      };

      // Handle recognition end
      recognition.onend = () => {
        log("debug", "Recognition ended");

        // If we have a pending restart, start again
        if (pendingRestart) {
          log("debug", "Executing pending restart");
          pendingRestart = false;
          start();
        } else if (isListening && !isPaused) {
          // For normal operation, restart after a short delay
          // This handles both errors and normal end events
          setTimeout(() => {
            if (isListening && !isPaused) {
              log("info", "Restarting recognition after end");
              start();
            }
          }, 100);
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
   * Reset the inactivity timeout
   */
  function resetInactivityTimeout() {
    // Clear any existing timeout
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = null;
    }

    // Set a new timeout
    inactivityTimeout = setTimeout(() => {
      if (isListening && !isPaused) {
        log("info", "No activity detected, restarting recognition");
        stop();
        setTimeout(() => {
          if (isListening && !isPaused) {
            start();
          }
        }, 100);
      }
    }, INACTIVITY_TIMEOUT_MS);
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
   * Reset to wake word listening mode
   */
  function resetToWakeWordListening() {
    log("debug", "Resetting to wake word listening mode");
    isCommandComplete = true;
    wakeWordDetected = false;
    isProcessingCommand = false;
    commandMode = false;
    waitingForNextFinal = false;

    // Stop command listening
    stopCommandListening();

    // Reset state
    currentCommand = "";
    fullTranscript = "";
    interimTranscript = "";

    // Notify that we're returning to wake word listening
    config.onCommandTimeout();
  }

  /**
   * Start listening for a command after wake word detection
   */
  function startCommandListening() {
    log("debug", "Starting command listening");

    // Clear any existing command timeout
    if (commandTimeout) {
      clearTimeout(commandTimeout);
      commandTimeout = null;
    }

    // Clear any existing countdown interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    // Set the command start time
    commandStartTime = Date.now();
    log(
      "debug",
      `Command listening started at ${commandStartTime}, will timeout after ${config.commandTimeoutMs}ms`
    );

    // Start a countdown timer that updates every second
    let remainingTime = config.commandTimeoutMs;
    countdownInterval = setInterval(() => {
      remainingTime -= 1000;
      const secondsLeft = Math.ceil(remainingTime / 1000);
      log("info", `Waiting for command... ${secondsLeft}s remaining`);

      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);

    // Set a single timeout for the full duration
    commandTimeout = setTimeout(() => {
      log(
        "debug",
        `Command timeout triggered after ${config.commandTimeoutMs}ms`
      );

      // Clear the countdown interval
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }

      if (!isCommandComplete && wakeWordDetected) {
        log("info", "Command finalized by timeout!");
        resetToWakeWordListening();
      }
    }, config.commandTimeoutMs);
  }

  /**
   * Pause the command timeout when the user starts talking
   */
  function pauseCommandTimeout() {
    log("debug", "Pausing command timeout");

    // Clear the existing timeout
    if (commandTimeout) {
      clearTimeout(commandTimeout);
      commandTimeout = null;
    }

    // Clear the countdown interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    // We'll restart the timeout when we get the next isFinal event
    // or when we detect silence again
  }

  /**
   * Stop listening for a command
   */
  function stopCommandListening() {
    log("debug", "Stopping command listening");

    // Clear the command timeout
    if (commandTimeout) {
      clearTimeout(commandTimeout);
      commandTimeout = null;
    }

    // Clear the countdown interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  /**
   * Process a command
   * @param {string} commandText - The command text to process
   */
  function processCommand(commandText) {
    if (!isCommandComplete && wakeWordDetected) {
      log("debug", "Processing command...");
      isCommandComplete = true;
      wakeWordDetected = false;
      isProcessingCommand = false;
      commandMode = false; // Exit command mode
      waitingForNextFinal = false; // Reset waiting for command flag

      // Stop command listening
      stopCommandListening();

      log("debug", `Command text: "${commandText}"`);

      // Only process if this is a valid command (not empty and meets minimum length)
      if (commandText && commandText.length >= MIN_COMMAND_LENGTH) {
        log("debug", "Calling onCommand callback");
        config.onCommand(commandText);
      } else {
        // If no valid command was detected, notify that we're returning to wake word listening
        log("info", `Last transcript: "${lastTranscript}"`);
        log("info", `Full transcript: "${fullTranscript}"`);
        log("info", `commandText: "${commandText}"`);
        log(
          "info",
          "No valid command detected, returning to wake word listening ❌"
        );
        log("debug", "Calling onCommandTimeout callback");
        config.onCommandTimeout();
      }

      // Reset state
      currentCommand = "";
      fullTranscript = "";
      interimTranscript = "";
    }
  }

  /**
   * Finalize the current command
   */
  function finalizeCommand() {
    if (!isCommandComplete && wakeWordDetected) {
      log("debug", "Finalizing command...");
      isCommandComplete = true;
      wakeWordDetected = false;
      isProcessingCommand = false;
      commandMode = false; // Exit command mode
      waitingForNextFinal = false; // Reset waiting for command flag

      // Stop command listening
      stopCommandListening();

      // Get the command text - either from the current command or extract it
      let finalCommand = currentCommand;
      if (!finalCommand || finalCommand.length < MIN_COMMAND_LENGTH) {
        finalCommand = extractCommandText(fullTranscript);
      }

      log("debug", `Final command text: "${finalCommand}"`);

      // Only process if this is a valid command (not empty and meets minimum length)
      if (finalCommand && finalCommand.length >= MIN_COMMAND_LENGTH) {
        log("debug", "Calling onCommand callback");
        config.onCommand(finalCommand);
      } else {
        // If no valid command was detected, notify that we're returning to wake word listening
        log("info", `Last transcript: "${lastTranscript}"`);
        log("info", `Full transcript: "${fullTranscript}"`);
        log(
          "info",
          "No valid command detected, returning to wake word listening ❌"
        );
        log("debug", "Calling onCommandTimeout callback");
        config.onCommandTimeout();
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
      const command = normalizedText
        .substring(wakeWordIndex + normalizedWakeWord.length)
        .trim();
      log("debug", `Extracted command after wake word: "${command}"`);
      return command;
    }

    // If no wake word found but we're in a command, return the current command
    if (wakeWordDetected && currentCommand) {
      log("debug", `Using current command: "${currentCommand}"`);
      return currentCommand;
    }

    // Check if we have a buffered command that might be a quick command
    if (commandBuffer && !wakeWordDetected) {
      const now = Date.now();
      if (now - lastWakeWordTime < QUICK_COMMAND_BUFFER_MS) {
        log("debug", `Using buffered command: "${commandBuffer}"`);
        return commandBuffer;
      }
    }

    // If we're in command mode but no wake word in this transcript,
    // assume the entire transcript is the command
    if (commandMode && !isCommandComplete) {
      log(
        "debug",
        `No wake word in transcript, assuming entire transcript is command: "${normalizedText}"`
      );
      return normalizedText;
    }

    // Otherwise return empty string
    return "";
  }

  /**
   * Start listening for the wake word
   */
  function start() {
    try {
      // Don't start if we're in the process of stopping
      if (isStopping) {
        log("debug", "Cannot start while stopping, will retry");
        setTimeout(() => start(), 50);
        return;
      }

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

      // Set inactivity timeout
      resetInactivityTimeout();
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
      isStopping = true;
      recognition.stop();
      isListening = false;
      isPaused = false;

      // Clear inactivity timeout
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = null;
      }

      // Set a flag to indicate we're no longer stopping after a short delay
      setTimeout(() => {
        isStopping = false;
      }, 50);
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
    // Clear all command-related state
    currentCommand = "";
    isCommandComplete = false;
    wakeWordDetected = false;
    isProcessingCommand = false;
    fullTranscript = "";
    interimTranscript = "";
    commandBuffer = ""; // Clear command buffer

    // Clear any existing timeouts
    if (commandTimeout) {
      clearTimeout(commandTimeout);
      commandTimeout = null;
    }

    // Update the wake word
    config.wakeWord = wakeWord.toLowerCase().trim();

    // Set pending restart flag and stop
    pendingRestart = true;
    stop();

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
      // Set pending restart flag and stop
      pendingRestart = true;
      stop();
    }
    log("info", `Language set to: "${language}"`);
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
