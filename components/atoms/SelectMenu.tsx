'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const SelectMenu = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => (
        <div {...props} ref={ref} className={cn(
            'custom-scrollbar fixed z-50 max-h-64 overflow-y-auto rounded-md border border-border-default bg-bg-elevated py-1 text-sm shadow-subtle',
            className
        )}>{children}</div>
    )
);

SelectMenu.displayName = 'SelectMenu';
