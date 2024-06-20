import { A } from "@solidjs/router";
import { ParentComponent } from "solid-js";

const FlameIcon = () => <img src="https://fireproof.storage/static/img/flame.svg" alt="Fireproof logo" width="25" />;

interface LinkProps {
  readonly href: string;
}

const Link: ParentComponent<LinkProps> = (props) => (
  <A class="nav-link" href={props.href} activeClass="nav-link-active" end>
    {props.children}
  </A>
);

function Navbar() {
  return (
    <nav class="navbar">
      <div class="nav-content">
        <div class="app-title-container">
          <FlameIcon /> Fireproof Demo
        </div>
        <Link href="/">Home</Link>
        <Link href="/todo">Todo</Link>
        <Link href="/todoEdit">Edit Todo</Link>
      </div>
    </nav>
  );
}

export default Navbar;
