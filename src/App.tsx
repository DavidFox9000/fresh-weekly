import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useSpotifyAuth } from "./hooks/useSpotifyAuth";
import Home from "./routes/Home";
import Generator from "./routes/Generator";
import { buttonGhost } from "./lib/styles";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function App() {
  const { token, isAuthorizing, authError, login, logout } = useSpotifyAuth();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("dw3-theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const navBase =
    "text-[0.65rem] font-semibold uppercase tracking-[0.28em] transition";
  const navIdle =
    "text-black hover:text-black dark:text-slate-400 dark:hover:text-white";
  const navActive = "text-black dark:text-white";
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const isIos = useMemo(() => {
    const userAgent = navigator.userAgent || navigator.vendor;
    return /iPad|iPhone|iPod/.test(userAgent);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("dw3-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    if (isIos) {
      setShowIosInstall((current) => !current);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#1DB954] via-[#2bd45f] to-[#b7f5c6] shadow-sm" />
          <div>
            <p className="text-lg font-semibold tracking-wide text-black dark:text-white">
              Fresh Weekly
            </p>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              Bias-aware Spotify playlists
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `${navBase} ${isActive ? navActive : navIdle}`
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/generator"
            className={({ isActive }) =>
              `${navBase} ${isActive ? navActive : navIdle}`
            }
          >
            Generator
          </NavLink>
          {token ? (
            <button className={buttonGhost} onClick={logout}>
              Disconnect
            </button>
          ) : (
            <button className={buttonGhost} onClick={login}>
              Connect
            </button>
          )}
          <button
            type="button"
            aria-pressed={theme === "dark"}
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
            className="flex items-center gap-3 rounded-full border border-emerald-400 bg-white/80 px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-emerald-800 transition hover:border-emerald-500 hover:text-emerald-900 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:border-emerald-500 dark:hover:text-white dark:hover:bg-emerald-900/50"
          >
            <span>Theme</span>
            <span
              className={`relative h-5 w-10 rounded-full border border-emerald-200 bg-emerald-50 transition dark:border-emerald-700 dark:bg-emerald-950 ${
                theme === "dark" ? "border-emerald-400 bg-emerald-900/60" : ""
              }`}
            >
              <span
                className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[#1DB954] shadow transition ${
                  theme === "dark" ? "left-5" : "left-1"
                }`}
              />
            </span>
          </button>
          {(installPrompt || isIos) && (
            <button className={buttonGhost} onClick={handleInstall}>
              Add to Home
            </button>
          )}
        </nav>
      </header>

      {showIosInstall && (
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-100">
            On iPhone: tap the Share button in Safari, then choose "Add to Home
            Screen."
          </div>
        </div>
      )}

      {authError && (
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {authError}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 pb-16">
        <Routes>
          <Route
            path="/"
            element={<Home isAuthed={!!token} onLogin={login} />}
          />
          <Route
            path="/generator"
            element={
              <Generator
                token={token}
                isAuthorizing={isAuthorizing}
                onLogin={login}
              />
            }
          />
        </Routes>
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs uppercase tracking-[0.3em] text-slate-700 dark:text-slate-400">
        <p>Built with Spotify Web API. Client-only PKCE flow.</p>
      </footer>
    </div>
  );
}

export default App;
