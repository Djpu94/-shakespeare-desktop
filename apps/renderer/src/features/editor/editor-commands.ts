export type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "inlineCode"
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock";

export type EditorCommandGroup = "inline" | "block" | "list";

export interface EditorCommandDefinition {
  readonly id: EditorCommand;
  readonly label: string;
  readonly group: EditorCommandGroup;
  readonly ariaKeyShortcut: string;
  readonly shortcutLabel: string;
}

export const EDITOR_COMMAND_DEFINITIONS = [
  {
    id: "bold",
    label: "Negrita",
    group: "inline",
    ariaKeyShortcut: "Control+B",
    shortcutLabel: "Ctrl+B",
  },
  {
    id: "italic",
    label: "Cursiva",
    group: "inline",
    ariaKeyShortcut: "Control+I",
    shortcutLabel: "Ctrl+I",
  },
  {
    id: "underline",
    label: "Subrayado",
    group: "inline",
    ariaKeyShortcut: "Control+U",
    shortcutLabel: "Ctrl+U",
  },
  {
    id: "inlineCode",
    label: "Código en línea",
    group: "inline",
    ariaKeyShortcut: "Control+E",
    shortcutLabel: "Ctrl+E",
  },
  {
    id: "paragraph",
    label: "Texto normal",
    group: "block",
    ariaKeyShortcut: "Control+Alt+0",
    shortcutLabel: "Ctrl+Alt+0",
  },
  {
    id: "heading1",
    label: "Encabezado 1",
    group: "block",
    ariaKeyShortcut: "Control+Alt+1",
    shortcutLabel: "Ctrl+Alt+1",
  },
  {
    id: "heading2",
    label: "Encabezado 2",
    group: "block",
    ariaKeyShortcut: "Control+Alt+2",
    shortcutLabel: "Ctrl+Alt+2",
  },
  {
    id: "heading3",
    label: "Encabezado 3",
    group: "block",
    ariaKeyShortcut: "Control+Alt+3",
    shortcutLabel: "Ctrl+Alt+3",
  },
  {
    id: "bulletList",
    label: "Lista con viñetas",
    group: "list",
    ariaKeyShortcut: "Control+Shift+8",
    shortcutLabel: "Ctrl+Shift+8",
  },
  {
    id: "orderedList",
    label: "Lista numerada",
    group: "list",
    ariaKeyShortcut: "Control+Shift+7",
    shortcutLabel: "Ctrl+Shift+7",
  },
  {
    id: "blockquote",
    label: "Cita",
    group: "list",
    ariaKeyShortcut: "Control+Shift+9",
    shortcutLabel: "Ctrl+Shift+9",
  },
  {
    id: "codeBlock",
    label: "Bloque de código",
    group: "list",
    ariaKeyShortcut: "Control+Shift+E",
    shortcutLabel: "Ctrl+Shift+E",
  },
] as const satisfies readonly EditorCommandDefinition[];

export const EDITOR_COMMANDS_BY_ID: Record<
  EditorCommand,
  EditorCommandDefinition
> = Object.fromEntries(
  EDITOR_COMMAND_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<EditorCommand, EditorCommandDefinition>;

export interface EditorKeyboardInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing?: boolean;
}

/**
 * Maps a keyboard event to an editor command. It accepts both Control and Meta
 * so the same shortcuts work on Windows/Linux and macOS, and deliberately
 * ignores IME composition events.
 */
export function resolveEditorCommand(
  input: EditorKeyboardInput,
): EditorCommand | null {
  if (input.isComposing === true) {
    return null;
  }

  const primaryModifier = input.ctrlKey || input.metaKey;
  if (!primaryModifier) {
    return null;
  }

  const key = input.key.toLowerCase();
  if (!input.altKey && !input.shiftKey) {
    switch (key) {
      case "b":
        return "bold";
      case "i":
        return "italic";
      case "u":
        return "underline";
      case "e":
        return "inlineCode";
      default:
        return null;
    }
  }

  if (input.altKey && !input.shiftKey) {
    switch (key) {
      case "0":
        return "paragraph";
      case "1":
        return "heading1";
      case "2":
        return "heading2";
      case "3":
        return "heading3";
      default:
        return null;
    }
  }

  if (input.shiftKey && !input.altKey) {
    switch (key) {
      case "8":
        return "bulletList";
      case "7":
        return "orderedList";
      case "9":
        return "blockquote";
      case "e":
        return "codeBlock";
      default:
        return null;
    }
  }

  return null;
}

export function getEditorShortcutHelp(): string {
  return EDITOR_COMMAND_DEFINITIONS.map(
    (definition) => `${definition.label}: ${definition.shortcutLabel}`,
  ).join(" · ");
}
