import React, { useEffect, useRef } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';
import WorkoutBadge from './WorkoutBadge';

// 1. Define internal type signatures for your data layout matching the Go forecast structures
export interface UserForecast {
    email: string;
    peakVo2: number | null;
    labels: string[]; // e.g., ["2026-06-24", "Today", "2026-06-27"]
    values: (number | null)[];
    nextHiitDay: number | null;
    nextZone2Day: number | null;
    nextZone1Day: number | null;
    vo2maxClass?: "Low" | "Below Average" | "Above Average" | "High";
    error?: string | null;
}

interface UserCardProps {
    forecast: UserForecast;
    theme: "light" | "dark";
}

// 2. Pure helper function to format upcoming workout days cleanly
const formatDayOffset = (daysAhead: number | null): string => {
    const daysAheadAsInt = daysAhead !== null ? Math.round(daysAhead) : null;
    if (daysAheadAsInt === null) return "—";
    if (daysAheadAsInt === 0) return "Today";
    if (daysAheadAsInt === 1) return "Tomorrow";
    if (daysAheadAsInt < 0) return "Overdue";
    return `In ${daysAheadAsInt} days`;
};

interface UserCardProps {
    forecast: UserForecast;
    theme: "light" | "dark";
    title: string;
}

export const CardioUserCard: React.FC<UserCardProps> = ({ forecast, theme, title }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<ChartJS | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const styles = getComputedStyle(document.documentElement);
        const accent = styles.getPropertyValue("--accent-2").trim() || "#0a84ff";
        const muted = styles.getPropertyValue("--muted").trim() || "#8e8e93";
        const textColor = styles.getPropertyValue("--text").trim() || "#fff";
        const surface2 = styles.getPropertyValue("--surface-2").trim() || "#2c2c2e";
        const border = styles.getPropertyValue("--border").trim() || "#38383a";

        // 1. Find the index where "today" is located in your labels array
        const todayIndex = forecast.labels.findIndex(label => label === "Today");
        // Note: Replace "Today" with your exact string format if it's a date like "2026-06-25"

        // 2. If "today" is found, slice the arrays up to (and including) today
        const finalLabels = todayIndex !== -1 ? forecast.labels.slice(0, todayIndex + 1) : forecast.labels;
        const finalValues = todayIndex !== -1 ? forecast.values.slice(0, todayIndex + 1) : forecast.values;


        if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
        }

        if (!forecast.labels.length) return;

        chartRef.current = new ChartJS(canvas, {
            type: "line",
            data: {
                labels: finalLabels,
                datasets: [
                    {
                        data: finalValues,
                        borderColor: accent,
                        backgroundColor: `${accent}22`,
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.35,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const value = ctx.raw as number | null;
                                return value !== null ? ` ${value.toFixed(1)} mL/kg/min` : " —";
                            },
                        },
                        titleColor: textColor,
                        bodyColor: textColor,
                        backgroundColor: surface2,
                        borderColor: border,
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,                        
                    },
                },
                scales: {
                    x: {
                        bounds: 'ticks',
                        ticks: {
                            color: muted,
                            font: { size: 10 },
                            maxTicksLimit: 5,
                            maxRotation: 0,
                        },
                        grid: { display: false, color: `${muted}22` },
                    },
                    y: {
                        ticks: {
                            color: muted,
                            font: { size: 10 },
                            maxTicksLimit: 4,
                        },
                        grid: {
                            color: `${muted}22`,
                        },
                    },
                },
            },
        });

        return () => {
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [forecast, theme]);

    return (
        <div className="admin-user-card">
            <div className="admin-user-card__header">
                <span className="admin-user-card__title">{title}</span>
                {forecast.vo2maxClass && (
                    <span className={`admin-user-card__peak ${forecast.vo2maxClass.toLowerCase().replace(" ", "-")}`}>
                        {forecast.vo2maxClass}
                    </span>
                )}
                {forecast.peakVo2 !== null && (
                    <span className="admin-user-card__peak">
                        {forecast.peakVo2.toFixed(1)} VO₂max
                    </span>
                )}
            </div>

            {forecast.error ? (
                <div className="admin-user-card__error">{forecast.error}</div>
            ) : (
                <>
                    <div className="admin-user-card__chart-wrap" style={{ position: 'relative', height: '140px', width: '100%' }}>
                        <canvas ref={canvasRef} />
                    </div>
                    <div className="admin-user-card__stats">
                        <div className="admin-user-card__stat">
                            <span>Next HIIT</span>
                            <strong>{formatDayOffset(forecast.nextHiitDay)}</strong>
                        </div>
                        <div className="admin-user-card__stat">
                            <span>Next Run</span>
                            <strong>{formatDayOffset(forecast.nextZone2Day)}</strong>
                        </div>
                        <div className="admin-user-card__stat">
                            <span>Next Walk</span>
                            {/* <WorkoutBadge workoutDate={formatDayOffset(forecast.nextZone1Day)} theme={theme} /> */}
                            <strong>{formatDayOffset(forecast.nextZone1Day)}</strong>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CardioUserCard;