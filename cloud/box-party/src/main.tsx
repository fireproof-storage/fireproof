import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Box from "./Box.js";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Box />
  </StrictMode>,
);
