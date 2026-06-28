import { useEffect, useState } from "react";
import {
    Chart as ChartJS,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Filler,
} from "chart.js";
import { API } from "../../lib/api";
import { CardioUserCard } from "../CardioUserCard";

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

interface AdminDashboardProps {
    token: string;
    onLogout: () => void;
}

interface UserSummary {
    id: number;
    email: string;
}

interface UserForecast {
    email: string;
    labels: string[];
    values: (number | null)[];
    peakVo2: number | null;
    nextHiitDay: number | null;
    nextZone2Day: number | null;
    nextZone1Day: number | null;
    vo2maxClass?: "Low" | "Below Average" | "Above Average" | "High";
    error?: string;
}

export default function AdminDashboard({ token, onLogout }: AdminDashboardProps) {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [forecasts, setForecasts] = useState<UserForecast[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [theme, setTheme] = useState<"dark" | "light">(() =>
        document.documentElement.dataset.theme === "light" ? "light" : "dark"
    );

    async function apiFetchAdmin(path: string) {
        const res = await fetch(`${API}${path}`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (res.status === 401) {
            onLogout();
            throw new Error("Unauthorized");
        }
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || `Request failed (${res.status})`);
        }
        return res.json();
    }

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError("");
            try {
                const usersData: UserSummary[] = await apiFetchAdmin("/admin/users");
                setUsers(usersData);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const results = await Promise.allSettled(
                    usersData.map(async (u): Promise<UserForecast> => {
                        try {
                            const fc = await apiFetchAdmin(`/admin/users/${u.id}/forecast`);
                            const labels: string[] = [];
                            const values: (number | null)[] = [];
                            const seen = new Set<number>();

                            for (const pt of (fc.points ?? [])) {
                                const bucket = Math.round(Number(pt.day));
                                if (seen.has(bucket)) continue;
                                seen.add(bucket);
                                const d = new Date(today);
                                d.setDate(today.getDate() + bucket);
                                labels.push(
                                    bucket === 0
                                        ? "Today"
                                        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                );
                                const val = typeof pt.actual === "number" && Number.isFinite(pt.actual) ? pt.actual : typeof pt.fitnessSignal === "number" && Number.isFinite(pt.fitnessSignal) ? pt.fitnessSignal : null;
                                values.push(val);
                            }

                            let ceiledNextHiitDay = Math.ceil(fc.nextHiitDay);
                            let ceiledNextZone2Day = Math.ceil(fc.nextZone2Day);
                            let ceiledNextZone1Day = Math.ceil(fc.nextZone1Day);

                            ceiledNextHiitDay = Math.max(ceiledNextHiitDay, 0);
                            ceiledNextZone2Day = Math.max(ceiledNextZone2Day, 0);
                            ceiledNextZone1Day = Math.max(ceiledNextZone1Day, 0);

                            if (ceiledNextHiitDay == ceiledNextZone2Day) {
                                ceiledNextZone2Day = null;
                            }

                            return {
                                email: u.email,
                                labels,
                                values,
                                peakVo2: typeof fc.peakVo2 === "number" ? fc.peakVo2 : null,
                                vo2maxClass: typeof fc.vo2maxClass === "string" ? fc.vo2maxClass : null,
                                nextHiitDay: typeof ceiledNextHiitDay === "number" ? ceiledNextHiitDay : null,
                                nextZone2Day: typeof ceiledNextZone2Day === "number" ? ceiledNextZone2Day : null,
                                nextZone1Day: typeof ceiledNextZone1Day === "number" ? ceiledNextZone1Day : null,
                            };
                        } catch (err) {
                            return {
                                email: u.email,
                                labels: [],
                                values: [],
                                peakVo2: null,
                                vo2maxClass: null,
                                nextHiitDay: null,
                                nextZone2Day: null,
                                nextZone1Day: null,
                                error: err instanceof Error ? err.message : "Failed to load forecast",
                            };
                        }
                    })
                );

                setForecasts(
                    results.map((r, i) =>
                        r.status === "fulfilled"
                            ? r.value
                            : {
                                email: usersData[i].email,
                                labels: [],
                                values: [],
                                peakVo2: null,
                                vo2maxClass: null,
                                nextHiitDay: null,
                                nextZone2Day: null,
                                nextZone1Day: null,
                                error: "Request failed",
                            }
                    )
                );
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load users");
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [token]);

    return (
        <div className="card animate-in admin-dashboard">
            <div className="admin-header">
                <h1 className="admin-title">Admin — {users.length - 1} user{users.length - 1 !== 1 ? "s" : ""}</h1>
                <div className="admin-header-actions">
                    <button className="btn-secondary admin-logout-btn" onClick={onLogout}>
                        Sign out
                    </button>
                </div>
            </div>

            {loading && (
                <div className="admin-loading">
                    <span className="spinner large" />
                    <span>Loading data…</span>
                </div>
            )}

            {!loading && error && (
                <div className="alert alert-error admin-error">{error}</div>
            )}

            {!loading && !error && forecasts.length === 0 && (
                <p className="admin-empty">No users found.</p>
            )}

            {!loading && forecasts.length > 0 && (
                <div className="admin-grid">
                    {forecasts
                        .filter((fc) => fc.email !== 'kounkoujacques@hotmail.com')
                        .slice(0, forecasts.length - 1)
                        .map((fc) => (
                            <CardioUserCard key={fc.email} forecast={fc} theme={theme} title={fc.email} />
                        ))}
                </div>
            )}
            <div
                className="admin-user-card__disclaimer">
                <dd>© 2026 Miracle Health. All rights reserved.</dd>
            </div>
        </div>
    );
}
