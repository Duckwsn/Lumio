import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { PwaUpdateNotice, registerPwa, installPwaReloadHandler } from "./components/PwaExperience";

// Provider engines own imperative DOM lifecycles; mounting them once avoids a detached YouTube iframe in React's development double-mount.
registerPwa();
installPwaReloadHandler();
if (window.visualViewport) {
  const syncViewport = () => document.documentElement.style.setProperty("--visual-height", `${window.visualViewport!.height}px`);
  syncViewport();
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
createRoot(document.getElementById("root")!).render(<><App /><PwaUpdateNotice /></>);
