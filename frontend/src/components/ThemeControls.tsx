import { useState } from "react";
import { ACCENT_LABELS, ACCENT_NAMES } from "../theme";
import type { AccentName, ThemeMode } from "../theme";

const IconSettings = () => (
    <span className="icon-settings-label">≡</span>
);

interface ThemeControlsProps {
    theme: ThemeMode;
    accent: AccentName;
    onThemeChange: (theme: ThemeMode) => void;
    onAccentChange: (accent: AccentName) => void;
    onLogout: () => void;
}

export default function ThemeControls({ theme, accent, onThemeChange, onAccentChange, onLogout }: ThemeControlsProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="theme-menu-wrapper">
            <button
                className="theme-menu-toggle"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Theme and color settings"
                aria-expanded={menuOpen}
            >
                <IconSettings />
            </button>

            {menuOpen && (
                <div className="theme-menu-dropdown">
                    <div className="theme-menu-section">
                        <label className="theme-menu-label">Theme</label>
                        <div className="theme-menu-options">
                            <button
                                type="button"
                                className={`theme-menu-btn ${theme === "light" ? "is-active" : ""}`}
                                onClick={() => {
                                    onThemeChange("light");
                                    setMenuOpen(false);
                                }}
                            >
                                Light
                            </button>
                            <button
                                type="button"
                                className={`theme-menu-btn ${theme === "dark" ? "is-active" : ""}`}
                                onClick={() => {
                                    onThemeChange("dark");
                                    setMenuOpen(false);
                                }}
                            >
                                Dark
                            </button>
                        </div>
                    </div>

                    <div className="theme-menu-section">
                        <label className="theme-menu-label">Accent Color</label>
                        <div className="theme-menu-swatches">
                            {ACCENT_NAMES.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    className={`theme-menu-swatch ${accent === name ? "is-active" : ""}`}
                                    data-accent-name={name}
                                    onClick={() => {
                                        onAccentChange(name);
                                        setMenuOpen(false);
                                    }}
                                    title={ACCENT_LABELS[name]}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="theme-menu-section">
                        <button
                            type="button"
                            className="theme-menu-btn"
                            onClick={() => {
                                setMenuOpen(false);
                                onLogout();
                            }}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
