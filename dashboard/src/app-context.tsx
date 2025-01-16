import { createContext, JSX, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { ButtonToggleSidebar } from "./components/ButtonToggleSidebar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopArea } from "./components/TopArea.tsx";

export interface AppContextType {
  openMenu: string | null;
  setOpenMenu: (dbName: string | null) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (value: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  toggleMenu: (dbName: string) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
}

export const AppContext = createContext<AppContextType>({
  openMenu: null,
  setOpenMenu: () => {},
  isSidebarOpen: false,
  setIsSidebarOpen: () => {},
  isDarkMode: false,
  setIsDarkMode: () => {},
  toggleMenu: () => {},
  toggleDarkMode: () => {},
  toggleSidebar: () => {},
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
          openMenu,
          setOpenMenu,
          isSidebarOpen,
          setIsSidebarOpen,
          isDarkMode,
          setIsDarkMode,
          toggleMenu,
          toggleDarkMode,
          toggleSidebar,
        } satisfies AppContextType
      }
    >
      {children}
    </AppContext.Provider>
  );
}
