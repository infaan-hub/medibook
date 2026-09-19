import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./design/tokens.css";
import "./styles/global.css";
import "./styles/shell.css";
import { registerServiceWorker } from "./lib/pwa";

const container = document.getElementById("root");

if (!container) {
  throw new Error("MediBook: #root element not found in index.html");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();