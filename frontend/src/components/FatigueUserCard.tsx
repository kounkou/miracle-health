import React, { useEffect, useRef } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';

// 1. Define internal type signatures for your data layout matching the Go forecast structures
export interface FitnessForecast {
    values: (number | null)[];
    error?: string | null;
    k2: number | null; // Fatigue gain rate
    tau2: number | null; // Fatigue decay rate
}

interface UserCardProps {
    forecast: FitnessForecast;
    theme: "light" | "dark";
    title: string;
    k2: number | null;
    tau2: number | null;
}

export const FatigueUserCard: React.FC<UserCardProps> = ({ forecast, theme, title, k2, tau2 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<ChartJS | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const styles = getComputedStyle(document.documentElement);
        const accent = styles.getPropertyValue("--accent-2").trim() || "#0a84ff";
        const muted = styles.getPropertyValue("--muted").trim() || "#8e8e93";
        const textColor = styles.getPropertyValue("--text").trim() || "#fff";

        if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
        }

        chartRef.current = new ChartJS(canvas, {
            type: "line",
            data: {
                labels: forecast.values.map((_, index) => `Day ${index + 1}`), // Simple day labels
                datasets: [
                    {
                        data: forecast.values,
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
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const value = ctx.raw as number | null;
                                return value !== null ? ` ${value.toFixed(2)}` : " —";
                            },
                        },
                        titleColor: textColor,
                        bodyColor: textColor,
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
                {forecast.values !== null && (
                    <span className="admin-user-card__peak">
                        Current {forecast.values[forecast.values.length - 1].toFixed(1)}
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
                            <span>Fatigue Gain</span>
                            <strong>{k2.toFixed(5)}</strong>
                        </div>
                        <div className="admin-user-card__stat">
                            <span>Fatigue Decay</span>
                            <strong>{tau2.toFixed(0)} days</strong>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FatigueUserCard;