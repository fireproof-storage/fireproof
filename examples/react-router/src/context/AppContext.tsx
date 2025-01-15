import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TodoStorage } from '../types/todo';

interface AppContextType {
  selectedTodo: TodoStorage | null;
  setSelectedTodo: (todo: TodoStorage | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedTodo, setSelectedTodo] = useState<TodoStorage | null>(null);

  return (
    <AppContext.Provider value={{ selectedTodo, setSelectedTodo }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}