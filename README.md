# Wake Word Command

A lightweight JavaScript library for detecting wake words and extracting commands from speech in web applications.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Example](#example-voice-controlled-todo-list)
- [API Reference](#api-reference)
- [Browser Support](#browser-support)
- [License](#license)

## Features

- Wake word detection with customizable trigger words
- Real-time speech-to-text transcription
- Command extraction from speech
- Automatic error recovery and restart
- Cross-browser support
- TypeScript support

## Installation

```bash
npm install wake-word-command
```

## Usage

```javascript
import { createWakeWordDetection } from "wake-word-command";

// Create a new instance
const wakeWord = createWakeWordDetection({
  wakeWord: "hey assistant", // The wake word to detect
  language: "en-US", // Optional: language code (default: 'en-US')
  onWakeWordDetected: () => {
    console.log("Wake word detected!");
  },
  onTranscription: (text) => {
    console.log("Current transcription:", text);
  },
  onCommand: (command) => {
    console.log("Command received:", command);
  },
  onError: (error) => {
    console.error("Error:", error);
  },
});

// Start listening
wakeWord.start();

// Stop listening
wakeWord.stop();

// Pause listening
wakeWord.pause();

// Resume listening
wakeWord.resume();

// Change wake word
wakeWord.setWakeWord("new wake word");

// Change language
wakeWord.setLanguage("es-ES");

// Check if speech recognition is supported
if (wakeWord.isSupported()) {
  console.log("Speech recognition is supported");
}
```

## Example: Voice-Controlled Todo List

Here's a practical example of using the library to create a voice-controlled todo list:

```javascript
import { createWakeWordDetection } from "wake-word-command";

// Create a simple todo list UI
const todoList = document.createElement("ul");
document.body.appendChild(todoList);

// Create the wake word detector
const wakeWord = createWakeWordDetection({
  wakeWord: "hey todo",
  onWakeWordDetected: () => {
    // Show a visual indicator that the system is listening
    document.body.classList.add("listening");
  },
  onCommand: (command) => {
    // Remove the listening indicator
    document.body.classList.remove("listening");

    // Process the command
    const cmd = command.toLowerCase();

    if (cmd.includes("add")) {
      // Extract the todo item text
      const itemText = cmd.replace("add", "").trim();
      if (itemText) {
        const li = document.createElement("li");
        li.textContent = itemText;
        todoList.appendChild(li);
      }
    } else if (cmd.includes("remove") || cmd.includes("delete")) {
      // Extract the item number or text to remove
      const itemToRemove = cmd.replace(/remove|delete/, "").trim();
      const items = Array.from(todoList.children);
      const index = parseInt(itemToRemove) - 1;

      if (!isNaN(index) && items[index]) {
        items[index].remove();
      } else {
        // Try to find by text
        const item = items.find((li) =>
          li.textContent.toLowerCase().includes(itemToRemove)
        );
        if (item) item.remove();
      }
    } else if (cmd.includes("clear") || cmd.includes("clear all")) {
      todoList.innerHTML = "";
    }
  },
});

// Add some basic styles
const style = document.createElement("style");
style.textContent = `
  .listening::after {
    content: '🎤 Listening...';
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 10px 20px;
    border-radius: 20px;
  }
`;
document.head.appendChild(style);

// Start listening
wakeWord.start();
```

Try these voice commands:

- "Hey todo, add buy groceries"
- "Hey todo, add call mom"
- "Hey todo, remove 1"
- "Hey todo, delete buy groceries"
- "Hey todo, clear all"

## API Reference

### `createWakeWordDetection(options)`

Creates a new wake word detection instance.

#### Parameters

| Parameter                  | Type       | Required | Description                         |
| -------------------------- | ---------- | -------- | ----------------------------------- |
| options                    | `Object`   | Yes      | Configuration options               |
| options.wakeWord           | `string`   | Yes      | The wake word to detect             |
| options.language           | `string`   | No       | Language code (default: 'en-US')    |
| options.onWakeWordDetected | `Function` | No       | Callback when wake word is detected |
| options.onTranscription    | `Function` | No       | Callback with current transcription |
| options.onCommand          | `Function` | No       | Callback with extracted command     |
| options.onError            | `Function` | No       | Callback when an error occurs       |

#### Returns

An object with the following methods:

| Method                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `start()`               | Start listening for the wake word        |
| `stop()`                | Stop listening for the wake word         |
| `pause()`               | Pause listening for the wake word        |
| `resume()`              | Resume listening for the wake word       |
| `setWakeWord(wakeWord)` | Change the wake word                     |
| `setLanguage(language)` | Change the language                      |
| `isSupported()`         | Check if speech recognition is supported |

#### Example

```javascript
const wakeWord = createWakeWordDetection({
  wakeWord: "hey assistant",
  language: "en-US",
  onWakeWordDetected: () => console.log("Wake word detected!"),
  onCommand: (command) => console.log("Command:", command),
});
```

### Callback Functions

#### `onWakeWordDetected()`

Called when the wake word is detected. No parameters.

#### `onTranscription(text)`

Called with the current transcription as it's being spoken.

- `text` (string): The current transcription

#### `onCommand(command)`

Called when a complete command is detected.

- `command` (string): The extracted command (text after the wake word)

#### `onError(error)`

Called when an error occurs.

- `error` (string): The error message

## Browser Support

This library uses the Web Speech API, which is supported in:

- Chrome (desktop and mobile)
- Edge
- Safari (desktop and mobile)
- Opera
- Chrome for Android
- Samsung Internet

## License

MIT
