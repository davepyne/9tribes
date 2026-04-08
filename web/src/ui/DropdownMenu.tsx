import { useEffect, useRef, useState } from 'react';

export type MenuItem = {
  label: string;
  action?: string;
  disabled?: boolean;
  divider?: false;
};

export type MenuDivider = {
  divider: true;
  id?: string;
};

export type MenuEntry = MenuItem | MenuDivider;

type DropdownMenuProps = {
  label: string;
  items: MenuEntry[];
  onAction: (action: string) => void;
};

export function DropdownMenu({ label, items, onAction }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="dd-root" ref={rootRef}>
      <button
        type="button"
        className={`dd-trigger${open ? ' dd-trigger--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
      </button>
      {open ? (
        <div className="dd-panel">
          {items.map((entry) =>
            entry.divider ? (
              <hr key={entry.id} className="dd-divider" />
            ) : (
              <button
                key={entry.action ?? entry.label}
                type="button"
                className="dd-item"
                disabled={entry.disabled}
                onClick={() => {
                  setOpen(false);
                  if (entry.action) {
                    onAction(entry.action);
                  }
                }}
              >
                {entry.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
