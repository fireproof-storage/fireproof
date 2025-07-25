import React, { createContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { SuperThis } from "@fireproof/core";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { CloudContext } from "./cloud-context.js";

export interface AppContextType {
  sthis: SuperThis;
  cloud: CloudContext;
  sideBar: {
    openMenu: string | null;
    setOpenMenu: (dbName: string | null) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (value: boolean) => void;
    isDarkMode: boolean;
    setIsDarkMode: (value: boolean) => void;
    toggleMenu: (dbName: string) => void;
    toggleDarkMode: () => void;
    toggleSidebar: () => void;
  };
}

const sthis = ensureSuperThis();
const cloudContext = new CloudContext();

export const AppContext = createContext<AppContextType>({
  sthis,
  cloud: cloudContext,
  sideBar: {
    openMenu: null,
    setOpenMenu: () => {
      /* no-op */
    },
    isSidebarOpen: false,
    setIsSidebarOpen: () => {
      /* no-op */
    },
    isDarkMode: false,
    setIsDarkMode: () => {
      /* no-op */
    },
    toggleMenu: () => {
      /* no-op */
    },
    toggleDarkMode: () => {
      /* no-op */
    },
    toggleSidebar: () => {
      /* no-op */
    },
  },
});

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // const navigate = useNavigate();

  const params = useParams();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const darkModePreference = localStorage.getItem("darkMode");
    return darkModePreference === "true";
  });

  useEffect(() => {
    if (params.name) {
      setOpenMenu(params.name);
    }
  }, [params.name]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("darkMode", isDarkMode.toString());
  }, [isDarkMode]);

  function toggleMenu(dbName: string) {
    setOpenMenu(openMenu === dbName ? null : dbName);
  }

  function toggleDarkMode() {
    setIsDarkMode(!isDarkMode);
  }

  function toggleSidebar() {
    setIsSidebarOpen(!isSidebarOpen);
  }

  cloudContext.initContext();

  return (
    <AppContext.Provider
      value={
        {
          sthis,
          cloud: cloudContext,
          sideBar: {
            openMenu,
            setOpenMenu,
            isSidebarOpen,
            setIsSidebarOpen,
            isDarkMode,
            setIsDarkMode,
            toggleMenu,
            toggleDarkMode,
            toggleSidebar,
          },
        } satisfies AppContextType
      }
    >
      {children}
    </AppContext.Provider>
  );
}
