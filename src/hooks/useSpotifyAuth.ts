import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearStoredToken,
  exchangeCodeForToken,
  getAuthUrl,
  getStoredToken,
  refreshAccessToken,
  type SpotifyToken,
} from "../lib/spotify";

const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
];

export const useSpotifyAuth = () => {
  const [token, setToken] = useState<SpotifyToken | null>(() =>
    getStoredToken()
  );
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const isExchangingRef = useRef(false);

  const login = useCallback(async () => {
    setAuthError(null);
    const url = await getAuthUrl(SCOPES);
    window.location.assign(url);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setAuthError(error);
      return;
    }

    if (!code) return;
    if (isExchangingRef.current) return;
    isExchangingRef.current = true;

    setIsAuthorizing(true);
    exchangeCodeForToken(code)
      .then((nextToken) => {
        setToken(nextToken);
      })
      .catch((err) => {
        setAuthError(err instanceof Error ? err.message : "Auth failed");
      })
      .finally(() => {
        setIsAuthorizing(false);
        isExchangingRef.current = false;
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      });
  }, []);

  useEffect(() => {
    if (!token) return;
    const refreshIfNeeded = async () => {
      if (token.expiresAt > Date.now() + 60_000) return;
      setIsAuthorizing(true);
      const refreshed = await refreshAccessToken(token.refreshToken);
      if (refreshed) {
        setToken(refreshed);
      } else {
        setAuthError("Session expired. Please log in again.");
        logout();
      }
      setIsAuthorizing(false);
    };
    void refreshIfNeeded();
  }, [token, logout]);

  return { token, isAuthorizing, authError, login, logout };
};
