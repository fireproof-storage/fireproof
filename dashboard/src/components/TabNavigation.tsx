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
 */
export function TabNavigation({ tabs, className = "" }: TabNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Dirty Helper function to check if a tab is active
  // TODO: Make this better
  function isTabActive(tabId: string) {
    const pathParts = location.pathname.split("/");
    return pathParts.includes(tabId);
  }

  return (
    <div className={`mx-6 flex border-b border-fp-dec-00 text-fp-p text-14 ${className}`}>
      <nav className="flex" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.id)}
            className={`
              px-4 py-2 border-b-2 select-none hover:border-fp-a-03
              ${isTabActive(tab.id) ? "border-fp-a-03 text-fp-a-03" : "border-transparent"}
            `}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
