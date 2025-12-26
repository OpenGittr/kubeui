import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
}

export function ActionMenu({ items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 160, // 160 = menu width (w-40)
      });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[100]"
          style={{ top: position.top, left: position.left }}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!item.disabled) {
                  item.onClick();
                  setOpen(false);
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                item.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : item.variant === 'danger'
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
