import { describe, expect, test } from "bun:test";
import { detectMode, parseChoiceEvent, parseEventJson } from "../scripts/domain";

describe("detectMode", () => {
  test("fragments are bundle mode", () => {
    expect(detectMode("<h2>Which layout?</h2>")).toBe("bundle");
    expect(detectMode("  <div class=\"vc-card\">x</div>")).toBe("bundle");
    expect(detectMode("<!-- comment --><p>hi</p>")).toBe("bundle");
  });

  test("whole documents are plain mode", () => {
    expect(detectMode("<!doctype html><html><body>x</body></html>")).toBe("plain");
    expect(detectMode("\n<!DOCTYPE HTML>\n<html>")).toBe("plain");
    expect(detectMode("<html lang=\"en\">")).toBe("plain");
  });
});

describe("parseChoiceEvent", () => {
  test("accepts a well formed choice and trims it", () => {
    const event = parseChoiceEvent({ type: "choice", choice: "  a  ", text: " One " }, "ws", 1);
    expect(event).toEqual({ type: "choice", choice: "a", text: "One", channel: "ws", at: 1 });
  });

  test("treats a legacy click message as a choice", () => {
    expect(parseChoiceEvent({ type: "click", choice: "b" }, "ws", 1)?.choice).toBe("b");
  });

  test("rejects missing, empty, oversized and hostile values", () => {
    expect(parseChoiceEvent(null, "ws", 1)).toBeNull();
    expect(parseChoiceEvent({ type: "choice" }, "ws", 1)).toBeNull();
    expect(parseChoiceEvent({ type: "choice", choice: "   " }, "ws", 1)).toBeNull();
    expect(parseChoiceEvent({ type: "choice", choice: 42 }, "ws", 1)).toBeNull();
    expect(parseChoiceEvent({ type: "choice", choice: "a".repeat(201) }, "ws", 1)).toBeNull();
    expect(parseChoiceEvent({ type: "choice", choice: "a\u0000b" }, "ws", 1)).toBeNull();
    expect(parseChoiceEvent({ type: "other", choice: "a" }, "ws", 1)).toBeNull();
  });

  test("drops unknown fields instead of persisting them", () => {
    const event = parseChoiceEvent({ type: "choice", choice: "a", evil: "x" }, "form", 2);
    expect(Object.keys(event ?? {})).toEqual(["type", "choice", "text", "channel", "at"]);
  });

  test("survives malformed JSON", () => {
    expect(parseEventJson("{not json", "ws", 1)).toBeNull();
    expect(parseEventJson('{"type":"choice","choice":"a"}', "form", 1)?.channel).toBe("form");
  });
});
