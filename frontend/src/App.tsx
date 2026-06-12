import { useEffect, useRef, useState } from "react";
import Dashboard from "./components/dashboard/Dashboard";
import { ConfirmScreen, EmailSentScreen, LoginForm, RegisterForm } from "./components/auth/AuthScreens";
import { apiFetch } from "./lib/api";
import {
    ACCENT_STORAGE_KEY,
    applyThemeAccentVars,
    accentStorageKeyFor,
    THEME_STORAGE_KEY,
    themeStorageKeyFor,
} from "./theme";
import type { AccentName, ThemeMode } from "./theme";

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

interface SessionData {
    token: string;
    email: string;
    expiresAt?: string;
}

export default function App() {
    const params = new URLSearchParams(window.location.search);
    const confirmToken = params.get("token");
    const [view, setView] = useState(confirmToken ? "confirm" : "login");
    const [confirmedEmail, setConfirmedEmail] = useState("");
    const [theme, setTheme] = useState<ThemeMode>(() => {
        try {
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            return stored === "light" ? "light" : "dark";
        } catch {
            return "dark";
        }
    });
    const [accent, setAccent] = useState<AccentName>(() => {
        try {
            const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
            return stored === "blue" || stored === "teal" || stored === "coral" || stored === "violet" ? stored : "blue";
        } catch {
            return "blue";
        }
    });
    const [session, setSession] = useState<SessionData | null>(() => {
        try {
            const s = sessionStorage.getItem("session");
            return s ? JSON.parse(s) : null;
        } catch {
            return null;
        }
    });
    const inactivityTimerRef = useRef<number | null>(null);
    const sessionExpiryTimerRef = useRef<number | null>(null);
    const themeScopeLoadedRef = useRef<string>("");
    const content = session ? (
        <Dashboard
            token={session.token}
            email={session.email}
            apiFetchWithAuth={apiFetchWithAuth}
            onLogout={handleLogout}
            theme={theme}
            accent={accent}
            onThemeChange={handleThemeChange}
            onAccentChange={handleAccentChange}
        />
    ) : (
        <>
            {view === "confirm" && <ConfirmScreen token={confirmToken || ""} onDone={clearConfirmToken} />}
            {view === "login" && <LoginForm onSwitch={() => setView("register")} onLogin={handleLogin} />}
            {view === "register" && <RegisterForm onSwitch={() => setView("login")} onSuccess={handleRegistered} />}
            {view === "email-sent" && <EmailSentScreen email={confirmedEmail} onBackToLogin={() => setView("login")} />}
        </>
    );

    useEffect(() => {
        const email = session?.email;
        const scope = (email || "").toLowerCase();
        const themeKey = themeStorageKeyFor(email);
        const accentKey = accentStorageKeyFor(email);

        if (themeScopeLoadedRef.current !== scope) {
            return;
        }

        applyThemeAccentVars(theme, accent);

        try {
            localStorage.setItem(themeKey, theme);
            localStorage.setItem(accentKey, accent);
        } catch {
            // Ignore storage failures and keep the in-memory theme.
        }
    }, [theme, accent, session?.email]);

    useEffect(() => {
        const email = session?.email;
        const scope = (email || "").toLowerCase();
        const themeKey = themeStorageKeyFor(email);
        const accentKey = accentStorageKeyFor(email);

        try {
            const storedTheme = localStorage.getItem(themeKey);
            const storedAccent = localStorage.getItem(accentKey);

            const nextTheme: ThemeMode = storedTheme === "light" ? "light" : "dark";
            const nextAccent: AccentName =
                storedAccent === "blue" || storedAccent === "teal" || storedAccent === "coral" || storedAccent === "violet"
                    ? storedAccent
                    : "blue";

            setTheme(nextTheme);
            setAccent(nextAccent);
            applyThemeAccentVars(nextTheme, nextAccent);
            themeScopeLoadedRef.current = scope;
        } catch {
            applyThemeAccentVars(theme, accent);
            themeScopeLoadedRef.current = scope;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.email]);

    useEffect(() => {
        if (sessionExpiryTimerRef.current !== null) {
            window.clearTimeout(sessionExpiryTimerRef.current);
            sessionExpiryTimerRef.current = null;
        }

        if (!session?.expiresAt) {
            return;
        }

        const expiresAtMs = new Date(session.expiresAt).getTime();
        if (!Number.isFinite(expiresAtMs)) {
            return;
        }

        const msUntilExpiry = expiresAtMs - Date.now();
        if (msUntilExpiry <= 0) {
            handleLogout();
            return;
        }

        sessionExpiryTimerRef.current = window.setTimeout(() => {
            handleLogout();
        }, msUntilExpiry);

        return () => {
            if (sessionExpiryTimerRef.current !== null) {
                window.clearTimeout(sessionExpiryTimerRef.current);
                sessionExpiryTimerRef.current = null;
            }
        };
    }, [session]);

    useEffect(() => {
        if (!session) {
            if (inactivityTimerRef.current !== null) {
                window.clearTimeout(inactivityTimerRef.current);
                inactivityTimerRef.current = null;
            }
            return;
        }

        const resetInactivityTimer = () => {
            if (inactivityTimerRef.current !== null) {
                window.clearTimeout(inactivityTimerRef.current);
            }
            inactivityTimerRef.current = window.setTimeout(() => {
                handleLogout();
            }, INACTIVITY_TIMEOUT_MS);
        };

        const activityEvents: Array<keyof WindowEventMap> = [
            "mousemove",
            "mousedown",
            "keydown",
            "scroll",
            "touchstart",
        ];

        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, resetInactivityTimer, { passive: true });
        });
        resetInactivityTimer();

        return () => {
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, resetInactivityTimer);
            });
            if (inactivityTimerRef.current !== null) {
                window.clearTimeout(inactivityTimerRef.current);
                inactivityTimerRef.current = null;
            }
        };
    }, [session]);

    function handleThemeChange(nextTheme: ThemeMode) {
        applyThemeAccentVars(nextTheme, accent);
        setTheme(nextTheme);
    }

    function handleAccentChange(nextAccent: AccentName) {
        applyThemeAccentVars(theme, nextAccent);
        setAccent(nextAccent);
    }

    function handleLogin(token: string, email: string, expiresAt?: string) {
        const s: SessionData = { token, email, expiresAt };
        sessionStorage.setItem("session", JSON.stringify(s));
        setSession(s);
    }

    function handleLogout() {
        sessionStorage.removeItem("session");
        setSession(null);
        setView("login");
    }

    function handleRegistered(email: string) {
        setConfirmedEmail(email);
        setView("email-sent");
    }

    function clearConfirmToken() {
        window.history.replaceState({}, "", "/");
        setView("login");
    }

    async function apiFetchWithAuth(path: string, opts: RequestInit = {}) {
        try {
            return await apiFetch(path, opts);
        } catch (err) {
            if (err instanceof Error && /session expired or invalid|\(401\)/i.test(err.message)) {
                handleLogout();
            }
            throw err;
        }
    }

    return <>{content}</>;
}
