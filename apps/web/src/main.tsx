import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./games/gameDesignSystem.css";
import "./games/drawV4.css";
import { LandingPage } from "./components/LandingPage";
import { PwaUpdateNotice, registerPwa, installPwaReloadHandler } from "./components/PwaExperience";

const App = lazy(() => import("./App").then((module) => ({ default: module.App })));
const publicLanding = window.location.pathname === "/" && !localStorage.getItem("lumio.session.v1");

// Provider engines own imperative DOM lifecycles; mounting them once avoids a detached YouTube iframe in React's development double-mount.
registerPwa();
installPwaReloadHandler();
if (window.visualViewport) {
  const syncViewport = () => {
    const height = window.visualViewport!.height;
    document.documentElement.style.setProperty("--visual-height", `${height}px`);
    document.documentElement.toggleAttribute("data-compact-viewport", height < 600);
  };
  syncViewport();
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
const root = createRoot(document.getElementById("root")!);
root.render(<>{publicLanding ? <LandingPage navigate={(path) => window.location.assign(path)} /> : <Suspense fallback={<main className="entry-bootstrap"><span className="entry-loader" aria-label="Carregando Lumio" /></main>}><App /></Suspense>}<PwaUpdateNotice /></>);
import.meta.hot?.dispose(() => root.unmount());
