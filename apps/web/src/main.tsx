import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

// Provider engines own imperative DOM lifecycles; mounting them once avoids a detached YouTube iframe in React's development double-mount.
createRoot(document.getElementById("root")!).render(<App />);
