import { cn } from '@/lib/utils';

export type ViewMode = 'office' | 'staff';

interface NavigationSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function NavigationSwitch({ value, onChange }: NavigationSwitchProps) {
  return (
    <div className="pixel-frame inline-flex items-stretch rounded-[12px] bg-[linear-gradient(180deg,rgba(19,14,13,0.98),rgba(9,8,10,0.98))] p-1" style={{ imageRendering: 'pixelated' }}>
      <button
        type="button"
        onClick={() => onChange('office')}
        className={cn(
          'relative min-w-[132px] px-4 py-3 text-[10px] uppercase tracking-[0.24em] transition-all duration-200 font-display',
          value === 'office'
            ? 'bg-[linear-gradient(180deg,rgba(209,164,90,0.24),rgba(76,55,27,0.5))] text-[#f0d6a5] before:absolute before:inset-x-2 before:bottom-1 before:h-[2px] before:bg-[#00d4aa] before:content-[""] after:absolute after:left-1 after:top-1 after:text-[8px] after:text-[#00d4aa] after:content-[">"]'
            : 'text-[#9c907f] hover:text-[#b7aa96]'
        )}
      >
        🏢 Office
      </button>
      <div className="w-px bg-[#d1a45a]/15" />
      <button
        type="button"
        onClick={() => onChange('staff')}
        className={cn(
          'relative min-w-[132px] px-4 py-3 text-[10px] uppercase tracking-[0.24em] transition-all duration-200 font-display',
          value === 'staff'
            ? 'bg-[linear-gradient(180deg,rgba(209,164,90,0.24),rgba(76,55,27,0.5))] text-[#f0d6a5] before:absolute before:inset-x-2 before:bottom-1 before:h-[2px] before:bg-[#00d4aa] before:content-[""] after:absolute after:left-1 after:top-1 after:text-[8px] after:text-[#00d4aa] after:content-[">"]'
            : 'text-[#9c907f] hover:text-[#b7aa96]'
        )}
      >
        👥 Staff
      </button>
    </div>
  );
}
