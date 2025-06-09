export function FireproofMenu() {
  return (
    <header className=" bg-gray-800 pt-3 pb-1 px-5 flex items-center justify-between">
      <a href="https://fireproof.storage/">
        <img src="https://fireproof.storage/static/img/logo-animated.svg" alt="Fireproof Logo" className="h-16 w-auto pr-2" />
      </a>
      <nav className="nav-menu  text-white">
        <ul className="flex">
          <li className="mr-6">
            <a href="https://fireproof.storage/developer/">Docs</a>
          </li>
          <li className="mr-6">
            <a href="https://fireproof.storage/blog/">Blog</a>
          </li>
          <li className="mr-6">
            <a href="https://fireproof.storage/thanks/">Community</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
