/**
 * @jest-environment jsdom
 */

import { createWakeWordDetection } from "../wake-word-detection";

describe("Wake Word Detection", () => {
  let wakeWord;

  beforeEach(() => {
    // Mock the SpeechRecognition API
    global.SpeechRecognition = class {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "";
      }
      start() {}
      stop() {}
    };
    global.webkitSpeechRecognition = global.SpeechRecognition;
  });

  afterEach(() => {
    wakeWord = null;
  });

  test("should create instance with required wake word", () => {
    wakeWord = createWakeWordDetection({ wakeWord: "hey test" });
    expect(wakeWord).toBeDefined();
    expect(typeof wakeWord.start).toBe("function");
    expect(typeof wakeWord.stop).toBe("function");
  });

  test("should throw error if wake word is not provided", () => {
    expect(() => {
      createWakeWordDetection({});
    }).toThrow("Wake word is required");
  });

  test("should check browser support", () => {
    wakeWord = createWakeWordDetection({ wakeWord: "hey test" });
    expect(wakeWord.isSupported()).toBe(true);
  });
});
