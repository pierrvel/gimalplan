import React from 'react';
import { PASTEL_STYLE_MAP } from '../data/presets';
import type { PastelColorKey } from '../types/planner';

interface SubjectBadgeProps {
  name: string;
  colorKey: PastelColorKey;
  compact?: boolean;
}

export const SubjectBadge: React.FC<SubjectBadgeProps> = ({ name, colorKey, compact = false }) => {
  const style = PASTEL_STYLE_MAP[colorKey] ?? PASTEL_STYLE_MAP.slate;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border ${style.bg} ${style.text} ${style.border} ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      } font-medium leading-none`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      <span>{name}</span>
    </span>
  );
};
