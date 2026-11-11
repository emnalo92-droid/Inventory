import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  ArrowLeftRight,
  ArrowRightLeft,
  Settings,
  Users,
  Database,
  BarChart3,
  CalendarDays,
  Coins,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  ShoppingBag
} from 'lucide-react';
import { getWeeksCount } from '../utils/helpers';

interface TabsNavProps {
  currentTab: string;
  onSelectTab: (tabId: string) => void;
  startDate: string;
  cutDate: string;
  canAccessTab?: (tabId: string) => boolean;
}

export const TabsNav: React.FC<TabsNavProps> = ({
  currentTab,
  onSelectTab,
  startDate,
  cutDate,
  canAccessTab
}) => {
  const weeks = getWeeksCount(startDate, cutDate);
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const allTabs = [
    { id: 'entry', label: 'Data Entry', icon: FileSpreadsheet },
    ...Array.from({ length: weeks }, (_, k) => ({
      id: `w${k + 1}`,
      label: `Week ${k + 1} Summary`,
      icon: CalendarDays
    })),
    { id: 'mo', label: 'Monthly Summary', icon: BarChart3 },
    { id: 'cash', label: 'Cash Details Summary', icon: Coins },
    { id: 'pnl', label: 'Profit and Loss', icon: TrendingUp },
    { id: 'tf', label: 'Transfer From', icon: ArrowLeftRight },
    { id: 'tt', label: 'Transfer To', icon: ArrowRightLeft },
    { id: 'soldout', label: 'Items Sold Out Summary', icon: ShoppingBag },
    { id: 'master', label: 'Item Master', icon: Database },
    { id: 'drive', label: 'Google Drive', icon: HardDrive },
    { id: 'users', label: 'User Access', icon: Users },
    { id: 'setup', label: 'Setup', icon: Settings }
  ];

  // Filter tabs according to user access permissions
  const visibleTabs = canAccessTab
    ? allTabs.filter(tab => canAccessTab(tab.id))
    : allTabs;

  const mainTabs = visibleTabs.length > 0 ? visibleTabs : allTabs;

  const checkScroll = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScroll, weeks, mainTabs.length]);

  // Ensure active tab is visible when it changes
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = setTimeout(checkScroll, 320);
    return () => clearTimeout(timer);
  }, [currentTab, checkScroll]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = navRef.current;
    if (!el) return;
    const scrollAmount = 260;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
    setTimeout(checkScroll, 320);
  };

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-16 z-20 shadow-xs">
      <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Scroll Left Button */}
          <button
            type="button"
            onClick={() => handleScroll('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll tabs left"
            title="Scroll tabs left"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shrink-0 shadow-xs"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Tab Navigation List */}
          <nav
            ref={navRef}
            onScroll={checkScroll}
            className="flex-1 flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scroll-smooth scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Tabs"
          >
            {mainTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-active={isActive ? 'true' : undefined}
                  onClick={() => onSelectTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-semibold border-b-2 border-teal-700 dark:border-teal-400'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Scroll Right Button */}
          <button
            type="button"
            onClick={() => handleScroll('right')}
            disabled={!canScrollRight}
            aria-label="Scroll tabs right"
            title="Scroll tabs right"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shrink-0 shadow-xs"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
