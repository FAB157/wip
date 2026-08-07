import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`relative overflow-hidden bg-surface-variant rounded-xl ${className}`}>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
    </div>
  );
};

export const ItinerarySkeleton = () => {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      
      <div className="space-y-4">
        {[1, 2, 3].map((day) => (
          <div key={day} className="bg-surface border border-outline-variant rounded-2xl p-4 shadow-sm relative overflow-hidden">
             <div className="flex gap-4 items-center mb-4">
                <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
             </div>
             
             <div className="space-y-3 pl-16">
               {[1, 2].map(stop => (
                 <div key={stop} className="flex gap-3">
                   <Skeleton className="w-16 h-16 rounded-xl shrink-0" />
                   <div className="space-y-2 flex-1">
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-3 w-5/6" />
                   </div>
                 </div>
               ))}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
