import { createContext, JSX, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CloudContext } from "./cloud-context.ts";
import { ensureSuperThis, SuperThis } from "use-fireproof";

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
    setOpenMenu: () => {},
    isSidebarOpen: false,
    setIsSidebarOpen: () => {},
    isDarkMode: false,
    setIsDarkMode: () => {},
    toggleMenu: () => {},
    toggleDarkMode: () => {},
    toggleSidebar: () => {},
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

  const toggleMenu = (dbName: string) => {
    setOpenMenu(openMenu === dbName ? null : dbName);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

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
