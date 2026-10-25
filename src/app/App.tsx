import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "./providers/theme-provider";
import { AppRouter } from "./router";

export function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AppRouter />
      </HashRouter>
    </ThemeProvider>
  );
}
