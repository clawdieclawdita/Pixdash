import { cn } from '@/lib/utils';

export type ViewMode = 'office' | 'staff';

interface NavigationSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function NavigationSwitch({ value, onChange }: NavigationSwitchProps) {
  return (
    <div className="inline-flex items-stretch rounded-lg border border-[#d1a45a]/30 bg-black/40 p-1" style={{ imageRendering: 'pixelated' }}>
      <button
        type="button"
        onClick={() => onChange('office')}
        className={cn(
          'relative px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-all duration-200',
          value === 'office'
            ? 'bg-[#d1a45a]/20 text-[#f0d6a5] shadow-[inset_0_0_0_1px_rgba(209,164,90,0.4)]'
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
          'relative px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-all duration-200',
          value === 'staff'
            ? 'bg-[#d1a45a]/20 text-[#f0d6a5] shadow-[inset_0_0_0_1px_rgba(209,164,90,0.4)]'
            : 'text-[#9c907f] hover:text-[#b7aa96]'
        )}
      >
        👥 Staff
      </button>
    </div>
  );
}
