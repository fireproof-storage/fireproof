import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface Tab {
  id: string;
  label: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  className?: string;
}

/**
 * A reusable tab navigation component that handles routing based on tab selection
 * with a smooth sliding animation effect
 */
export function TabNavigation({ tabs, className = "" }: TabNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  // Helper function to check if a tab is active
  function isTabActive(tabId: string) {
    const pathParts = location.pathname.split("/");
    return pathParts.includes(tabId);
  }

  // Update the underline position when location changes
  useEffect(() => {
    const activeIndex = tabs.findIndex((tab) => {
      const pathParts = location.pathname.split("/");
      return pathParts.includes(tab.id);
    });

    if (activeIndex !== -1) {
      const currentTab = tabsRef.current[activeIndex];
      if (currentTab) {
        setUnderlineStyle({
          left: currentTab.offsetLeft,
          width: currentTab.offsetWidth,
        });
      }
    }
  }, [location.pathname, tabs]);

  return (
    <div className={`mx-6 flex border-b border-fp-dec-00 text-fp-p text-14 relative ${className}`}>
      <nav className="flex relative" aria-label="Tabs">
        {/* Animated underline */}
        <div
          className="absolute bottom-0 h-0.5 bg-fp-a-03 transition-all duration-300"
          style={{
            left: `${underlineStyle.left}px`,
            width: `${underlineStyle.width}px`,
          }}
        />

        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabsRef.current[index] = el;
            }}
            type="button"
            onClick={() => navigate(tab.id)}
            className={`
              px-4 py-2 select-none hover:text-fp-a-03 transition-colors duration-200
              ${isTabActive(tab.id) ? "text-fp-a-03" : ""}
            `}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
