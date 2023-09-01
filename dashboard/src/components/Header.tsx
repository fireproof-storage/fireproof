export function Header() {
  return (
    <header className="pt-3 pb-1 px-5 flex items-center justify-between bg-slate-400 dark:bg-slate-900">
      <a href="https://fireproof.storage/">
        <img
          src="https://fireproof.storage/static/img/logo-animated.svg"
          alt="Fireproof Logo"
          className="logo"
        />
      </a>
      <nav >
        <ul className="flex">
          <li className="mr-6">
            <a href="https://use-fireproof.com">Docs</a>
          </li>
          <li className="mr-6">
            <a href="https://fireproof.storage/blog/">Blog</a>
          </li>
          <li className="mr-6">
            <a href="https://github.com/fireproof-storage/fireproof/discussions">Community</a>
          </li>
        </ul>
      </nav>
    </header>
  )
}
