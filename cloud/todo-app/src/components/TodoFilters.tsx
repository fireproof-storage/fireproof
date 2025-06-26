import { FilterType } from "../types.js";

interface TodoFiltersProps {
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  activeCount: number;
  completedCount: number;
}

/**
 * Filter component for todos
 */
function TodoFilters({ currentFilter, onFilterChange, activeCount, completedCount }: TodoFiltersProps) {
  const totalCount = activeCount + completedCount;

  return (
    <div>
      <div className="filters">
        <button className={currentFilter === "all" ? "active" : ""} onClick={() => onFilterChange("all")}>
          All ({totalCount})
        </button>
        <button className={currentFilter === "active" ? "active" : ""} onClick={() => onFilterChange("active")}>
          Active ({activeCount})
        </button>
        <button className={currentFilter === "completed" ? "active" : ""} onClick={() => onFilterChange("completed")}>
          Completed ({completedCount})
        </button>
      </div>
    </div>
  );
}

export default TodoFilters;
