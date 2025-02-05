import { useEffect } from "react";
import { User } from "./User.tsx";

export default function Header({ isDarkMode, setIsDarkMode }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("darkMode", isDarkMode.toString());
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(isDarkMode => !isDarkMode);
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b border-fp-dec-00 px-main flex-shrink-0">
      <h1 className="flex-1"></h1>
      <div className="flex items-center gap-[8px] text-14-heading text-fp-s sm:gap-[18px]">
        <a
          href="https://use-fireproof.com/docs/welcome/"
          rel="noopener noreferrer"
          target="_blank"
          className="mx-[4px] hover:underline hover:text-fp-p"
        >
          Docs
        </a>
        <a
          href="https://fireproof.storage/blog/"
          rel="noopener noreferrer"
          target="_blank"
          className="mx-[4px] hover:underline hover:text-fp-p"
        >
          Blog
        </a>
        <a
          href="https://discord.gg/ZEjnnnFF2D"
          rel="noopener noreferrer"
          target="_blank"
          className="mx-[4px] hover:underline hover:text-fp-p"
        >
          Community
        </a>
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-full bg-fp-dec-00 text-fp-p hover:opacity-60"
        >
          {isDarkMode ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-2">
            <User />
        </div>
      </div>
    </header>
  );
}