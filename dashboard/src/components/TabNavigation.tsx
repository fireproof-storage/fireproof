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

  return (
    <div className={`flex border-b border-fp-dec-00 text-fp-p text-14 ${className}`}>
      <nav className="flex" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.id)}
            className={`
              px-4 py-2 border-b-2 select-none hover:border-fp-a-03
              ${location.pathname.endsWith(tab.id) ? "border-fp-a-03 text-fp-a-03" : "border-transparent"}
            `}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
