import React from "react";
import logo from "../../assets/logo.svg";
import "./AppHeader.css"; // eslint-disable-line
import { Link } from "react-router-dom";
/**
 * AppHeader component
 * @param {Object} props
 * @returns {React.Component}
 */
const AppHeader = (props) => {
  return (
    <header className="app-header">
      <div className="app-title-wrapper">
        <div className="app-title-wrapper">
          <div className="app-left-nav">
            <Link to="/">
              <img src={logo} className="app-logo" alt="Fireproof Storage" />
            </Link>
            <div className="app-title-text">
              <h1 className="app-title">TodoMVC</h1>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
