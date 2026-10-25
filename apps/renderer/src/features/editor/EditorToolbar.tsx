import type {
  EditorCommand,
  EditorCommandDefinition,
} from "./editor-commands.js";
import { EDITOR_COMMAND_DEFINITIONS } from "./editor-commands.js";
import type { EditorFormattingState } from "./rich-text-dom.js";

interface EditorToolbarProps {
  controlsId: string;
  formatting: EditorFormattingState;
  onCommand(command: EditorCommand): void;
}

const SHORT_LABELS: Record<EditorCommand, string> = {
  bold: "B",
  italic: "I",
  underline: "U",
  inlineCode: "</>",
  paragraph: "¶",
  heading1: "H1",
  heading2: "H2",
  heading3: "H3",
  bulletList: "• Lista",
  orderedList: "1. Lista",
  blockquote: "❝",
  codeBlock: "{ }",
};

function isCommandActive(
  command: EditorCommand,
  formatting: EditorFormattingState,
): boolean {
  switch (command) {
    case "bold":
      return formatting.bold;
    case "italic":
      return formatting.italic;
    case "underline":
      return formatting.underline;
    case "inlineCode":
      return formatting.inlineCode;
    case "paragraph":
      return formatting.blockType === "paragraph";
    case "heading1":
      return formatting.blockType === "heading1";
    case "heading2":
      return formatting.blockType === "heading2";
    case "heading3":
      return formatting.blockType === "heading3";
    case "bulletList":
      return formatting.blockType === "bulletList";
    case "orderedList":
      return formatting.blockType === "orderedList";
    case "blockquote":
      return formatting.blockType === "blockquote";
    case "codeBlock":
      return formatting.blockType === "codeBlock";
  }
}

const GROUPS: readonly {
  readonly id: "inline" | "block" | "list";
  readonly label: string;
}[] = [
  { id: "inline", label: "Estilo de texto" },
  { id: "block", label: "Formato de párrafo" },
  { id: "list", label: "Listas, citas y código" },
];

function groupCommands(
  group: "inline" | "block" | "list",
): readonly EditorCommandDefinition[] {
  return EDITOR_COMMAND_DEFINITIONS.filter(
    (definition) => definition.group === group,
  );
}

export function EditorToolbar({
  controlsId,
  formatting,
  onCommand,
}: EditorToolbarProps) {
  return (
    <div
      aria-controls={controlsId}
      aria-label="Formato del texto"
      className="editor-toolbar"
      role="toolbar"
    >
      {GROUPS.map((group, groupIndex) => (
        <div
          aria-label={group.label}
          className="editor-toolbar-group"
          key={group.id}
          role="group"
        >
          {groupIndex > 0 && (
            <span aria-hidden="true" className="editor-toolbar-divider" />
          )}
          {groupCommands(group.id).map((definition) => {
            const active = isCommandActive(definition.id, formatting);
            return (
              <button
                aria-keyshortcuts={definition.ariaKeyShortcut}
                aria-label={definition.label}
                aria-pressed={active}
                className={active ? "editor-tool is-active" : "editor-tool"}
                key={definition.id}
                onClick={() => onCommand(definition.id)}
                onMouseDown={(event) => event.preventDefault()}
                title={`${definition.label} (${definition.shortcutLabel})`}
                type="button"
              >
                <span aria-hidden="true">{SHORT_LABELS[definition.id]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
