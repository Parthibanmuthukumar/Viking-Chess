import React from 'react';

export interface IconDescriptor {
  /** React component for the icon (e.g., imported SVG or library component) */
  Icon: React.ReactNode;
  /** Tooltip text */
  tooltip: string;
  /** Click handler */
  onClick: () => void;
}

/**
 * Renders a horizontal row of icon buttons.
 * Used on mobile view to expose History, Chat, Undo/Redo etc.
 */
export const IconRow: React.FC<{ icons: IconDescriptor[] }> = ({ icons }) => {
  return (
    <div className="icon-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      {icons.map((desc, idx) => (
        <button
          key={idx}
          className="icon-button"
          onClick={desc.onClick}
          aria-label={desc.tooltip}
          title={desc.tooltip}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {desc.Icon}
        </button>
      ))}
    </div>
  );
};
