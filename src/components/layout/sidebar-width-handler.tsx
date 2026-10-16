"use client";

import { useLayoutEffect, useState } from 'react';
import { useSidebar } from '@/contexts/sidebar-context';

export function SidebarWidthHandler({ children }: { children: React.ReactNode }) {
    const { isCollapsed } = useSidebar();
    const [isMobile, setIsMobile] = useState(false);

    // useLayoutEffect (not useEffect) for both: this component renders no JSX that depends on
    // isMobile, it only writes a CSS custom property straight to the DOM — useLayoutEffect runs
    // synchronously before the browser paints, so on a mobile hard-refresh the sidebar width
    // gets corrected to 0px before the first paint instead of flashing 256px for a frame first.
    useLayoutEffect(() => {
        // Media query for mobile (md breakpoint in Tailwind/layout is 768px)
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        
        const handleMatchChange = (e: MediaQueryListEvent | MediaQueryList) => {
            setIsMobile(e.matches);
        };

        // Set initial value
        handleMatchChange(mediaQuery);

        // Add listener
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleMatchChange);
        } else {
            mediaQuery.addListener(handleMatchChange);
        }

        return () => {
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleMatchChange);
            } else {
                mediaQuery.removeListener(handleMatchChange);
            }
        };
    }, []);

    useLayoutEffect(() => {
        // Update CSS variable for sidebar width
        document.documentElement.style.setProperty(
            '--sidebar-width',
            isMobile ? '0px' : (isCollapsed ? '80px' : '256px')
        );
    }, [isCollapsed, isMobile]);

    return <>{children}</>;
}
