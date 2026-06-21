import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono";
import "@fontsource/ibm-plex-serif";
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { LegalApp } from "./components/legal-app";

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<LegalApp />
	</React.StrictMode>,
);
