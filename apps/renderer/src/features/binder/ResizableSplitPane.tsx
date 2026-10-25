import { useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";

const MIN_BINDER_WIDTH = 220;
const MAX_BINDER_WIDTH = 520;
const DEFAULT_BINDER_WIDTH = 292;
const KEYBOARD_STEP = 16;
const KEYBOARD_LARGE_STEP = 64;

function clampWidth(width: number): number {
  return Math.min(MAX_BINDER_WIDTH, Math.max(MIN_BINDER_WIDTH, width));
}

interface ResizableSplitPaneProps {
  primary: ReactNode;
  secondary: ReactNode;
  primaryId: string;
  label: string;
  initialWidth?: number;
}

/**
 * Two-column workspace split. The separator is a real focusable control, so
 * the panel can be resized with the pointer or the keyboard.
 */
export function ResizableSplitPane({
  primary,
  secondary,
  primaryId,
  label,
  initialWidth = DEFAULT_BINDER_WIDTH,
}: ResizableSplitPaneProps) {
  const [width, setWidth] = useState(() => clampWidth(initialWidth));
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function beginDrag(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      startX: event.clientX,
      startWidth: width,
    };
    setIsDragging(true);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>): void {
    const state = dragState.current;
    if (state === null) {
      return;
    }
    setWidth(clampWidth(state.startWidth + event.clientX - state.startX));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    dragState.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;

    switch (event.key) {
      case "ArrowLeft":
        setWidth((current) => clampWidth(current - step));
        break;
      case "ArrowRight":
        setWidth((current) => clampWidth(current + step));
        break;
      case "Home":
        setWidth(MIN_BINDER_WIDTH);
        break;
      case "End":
        setWidth(MAX_BINDER_WIDTH);
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  return (
    <div
      className="split-pane"
      style={
        {
          "--split-primary-width": `${width}px`,
        } as CSSProperties
      }
    >
      <div className="split-pane-primary" id={primaryId}>
        {primary}
      </div>
      <div
        aria-controls={primaryId}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemax={MAX_BINDER_WIDTH}
        aria-valuemin={MIN_BINDER_WIDTH}
        aria-valuenow={width}
        aria-valuetext={`${width} píxeles`}
        className={
          isDragging ? "split-pane-handle is-dragging" : "split-pane-handle"
        }
        onDoubleClick={() => setWidth(DEFAULT_BINDER_WIDTH)}
        onKeyDown={handleKeyDown}
        onPointerCancel={endDrag}
        onPointerDown={beginDrag}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        role="separator"
        tabIndex={0}
        title="Arrastra o usa las flechas para ajustar el ancho del Binder"
      >
        <span aria-hidden="true" className="split-pane-grip" />
      </div>
      <div className="split-pane-secondary">{secondary}</div>
    </div>
  );
}
