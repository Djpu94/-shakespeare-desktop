import type { BinderNodeKind } from "@shakespeare/shared";

interface BinderKindIconProps {
  kind: BinderNodeKind;
}

const ICON_PATHS: Record<BinderNodeKind, string> = {
  folder:
    "M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  scene: "M4 6.5h16v11H4zM4 10h16M8.5 6.5 11 10M14 6.5 16.5 10",
  document: "M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6",
  character:
    "M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 20a6.5 6.5 0 0 1 13 0",
  location:
    "M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10ZM12 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  research: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 21 21",
  plot: "M6 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM18 14.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 7.5h4a3 3 0 0 1 3 3v4M15 12.5l3 2",
};

export function BinderKindIcon({ kind }: BinderKindIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`binder-kind-icon binder-kind-icon--${kind}`}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d={ICON_PATHS[kind]}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function BinderChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={
        expanded ? "binder-chevron-icon is-expanded" : "binder-chevron-icon"
      }
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="m9 6 6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function BinderMenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="binder-menu-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
