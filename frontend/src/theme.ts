export type ThemeMode = "dark" | "light";
export type AccentName = "blue";

export const THEME_STORAGE_KEY = "banister-theme";
export const ACCENT_STORAGE_KEY = "banister-accent";

export const ACCENT_NAMES: AccentName[] = ["blue"];
export const ACCENT_LABELS: Record<AccentName, string> = {
    blue: "Blue"
};

export function themeStorageKeyFor(email?: string) {
    if (!email) return THEME_STORAGE_KEY;
    return `${THEME_STORAGE_KEY}:${email.toLowerCase()}`;
}

export function accentStorageKeyFor(email?: string) {
    if (!email) return ACCENT_STORAGE_KEY;
    return `${ACCENT_STORAGE_KEY}:${email.toLowerCase()}`;
}

export function applyThemeAccentVars(theme: ThemeMode, accent: AccentName) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
}
