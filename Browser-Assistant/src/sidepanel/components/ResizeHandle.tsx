import { useState, useCallback, useEffect, useRef } from 'react';
import { PANEL_WIDTH_MIN, PANEL_WIDTH_MAX } from '../../shared/constants';

interface Props {
  onResize: (width: number) => void;
  isDark: boolean;
}

export function ResizeHandle({ onResize, isDark }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startX.current = e.clientX;
    startWidth.current = document.documentElement.clientWidth;
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = startX.current - e.clientX;
      const newWidth = Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, startWidth.current + dx));
      onResize(newWidth);
      document.body.style.width = newWidth + 'px';
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 cursor-col-resize flex-shrink-0 relative group ${
        isDark ? 'hover:bg-blue-500/30' : 'hover:bg-blue-500/20'
      } ${isDragging ? (isDark ? 'bg-blue-500/40' : 'bg-blue-500/30') : ''}`}
      style={{ touchAction: 'none' }}
    >
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-8 rounded flex items-center justify-center transition-opacity ${
          isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <div className="flex gap-0.5">
          <div className={`w-0.5 h-3 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-400'}`} />
          <div className={`w-0.5 h-3 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-400'}`} />
        </div>
      </div>
    </div>
  );
}
