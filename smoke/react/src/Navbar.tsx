import React from "react";
import { Link } from "react-router-dom";

const FlameIcon = () => <img src="https://fireproof.storage/static/img/flame.svg" alt="Fireproof logo" width="25" />;

interface LinkProps {
  readonly href: string;
  readonly children: React.ReactNode;
}

const NavLink: React.FC<LinkProps> = (props) => (
  <Link
    className="nav-link"
    to={props.href}
    // activeClass="nav-link-active"
    // end
  >
    {props.children}
  </Link>
);

function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-content">
        <div className="app-title-container">
          <FlameIcon /> Fireproof Demo
        </div>
        <NavLink href="/">Home</NavLink>
        <NavLink href="/todo">Todo</NavLink>
      </div>
    </nav>
  );
}

export default Navbar;
