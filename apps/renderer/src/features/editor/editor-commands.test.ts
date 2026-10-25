import { describe, expect, it } from "vitest";
import {
  EDITOR_COMMANDS_BY_ID,
  EDITOR_COMMAND_DEFINITIONS,
  getEditorShortcutHelp,
  resolveEditorCommand,
} from "./editor-commands.js";

function keyboard(
  key: string,
  modifiers: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    isComposing: boolean;
  }> = {},
) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("editor commands and shortcuts", () => {
  it("resolves the documented shortcut combinations", () => {
    expect(resolveEditorCommand(keyboard("b", { ctrlKey: true }))).toBe("bold");
    expect(resolveEditorCommand(keyboard("I", { ctrlKey: true }))).toBe(
      "italic",
    );
    expect(resolveEditorCommand(keyboard("u", { metaKey: true }))).toBe(
      "underline",
    );
    expect(resolveEditorCommand(keyboard("e", { ctrlKey: true }))).toBe(
      "inlineCode",
    );
    expect(
      resolveEditorCommand(keyboard("2", { ctrlKey: true, altKey: true })),
    ).toBe("heading2");
    expect(
      resolveEditorCommand(keyboard("0", { ctrlKey: true, altKey: true })),
    ).toBe("paragraph");
    expect(
      resolveEditorCommand(keyboard("8", { ctrlKey: true, shiftKey: true })),
    ).toBe("bulletList");
    expect(
      resolveEditorCommand(keyboard("7", { ctrlKey: true, shiftKey: true })),
    ).toBe("orderedList");
    expect(
      resolveEditorCommand(keyboard("9", { ctrlKey: true, shiftKey: true })),
    ).toBe("blockquote");
    expect(
      resolveEditorCommand(keyboard("E", { ctrlKey: true, shiftKey: true })),
    ).toBe("codeBlock");
  });

  it("ignores unrelated, incomplete, and IME-composing keystrokes", () => {
    expect(resolveEditorCommand(keyboard("b"))).toBeNull();
    expect(
      resolveEditorCommand(keyboard("b", { ctrlKey: true, altKey: true })),
    ).toBeNull();
    expect(
      resolveEditorCommand(keyboard("b", { ctrlKey: true, shiftKey: true })),
    ).toBeNull();
    expect(
      resolveEditorCommand(keyboard("b", { ctrlKey: true, isComposing: true })),
    ).toBeNull();
    expect(resolveEditorCommand(keyboard("s", { ctrlKey: true }))).toBeNull();
  });

  it("exposes accessible metadata for every command", () => {
    const ids = new Set(EDITOR_COMMAND_DEFINITIONS.map((item) => item.id));
    expect(ids.size).toBe(EDITOR_COMMAND_DEFINITIONS.length);
    for (const definition of EDITOR_COMMAND_DEFINITIONS) {
      expect(definition.ariaKeyShortcut).toMatch(/^Control(\+Alt|\+Shift)?\+./);
      expect(definition.shortcutLabel.length).toBeGreaterThan(0);
      expect(EDITOR_COMMANDS_BY_ID[definition.id]).toBe(definition);
    }

    const help = getEditorShortcutHelp();
    expect(help).toContain("Negrita: Ctrl+B");
    expect(help).toContain("Bloque de código");
  });
});
