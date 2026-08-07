import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-outline-variant rounded-3xl shadow-sm my-6">
      <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-primary opacity-80" strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-black text-on-surface mb-2">{title}</h3>
      <p className="text-sm text-on-surface-variant max-w-xs mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button 
          onClick={onAction}
          className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-hover shadow-md transition-all active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
