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
    rmse: number | null;
    isLoading: boolean;
}

export const FatigueUserCard: React.FC<UserCardProps> = ({ forecast, theme, title, k2, tau2, rmse, isLoading }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<ChartJS | null>(null);

    useEffect(() => {
        // Skip canvas drawing setups entirely if the card is actively loading empty variables
        if (isLoading || !forecast) {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const styles = getComputedStyle(document.documentElement);
        const accent = styles.getPropertyValue("--accent-2").trim() || "#0a84ff";
        const muted = styles.getPropertyValue("--muted").trim() || "#8e8e93";
        const textColor = styles.getPropertyValue("--text").trim() || "#fff";
        const surface2 = styles.getPropertyValue("--surface-2").trim() || "#2c2c2e";
        const border = styles.getPropertyValue("--border").trim() || "#38383a";

        if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
        }

        const today = new Date();
        const totalDaysInPast = forecast.values.length;
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (totalDaysInPast - 1));

        chartRef.current = new ChartJS(canvas, {
            type: "line",
            data: {
                labels: forecast.values.map((_, index) => {
                    const nextDate = new Date(startDate);
                    nextDate.setDate(startDate.getDate() + index);

                    // 3. Format the output string layout (e.g., "Jul 01" or "2026-07-01")
                    return nextDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                    });
                }),
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
                                return value !== null ? ` ${value.toFixed(2)}` : " —";
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
    }, [forecast, theme, isLoading]);

    return (
       <div className={`admin-user-card ${theme === 'dark' ? 'dark-theme' : ''}`}>
            <div className="admin-user-card__header">
                <span className="admin-user-card__title">{title}</span>
                {!isLoading && forecast.values !== null && (
                    <span className="admin-user-card__peak">
                        Current {forecast.values[forecast.values.length - 1].toFixed(3)}
                    </span>
                )}
            </div>

            {!isLoading && forecast.error ? (
                <div className="admin-user-card__error">{forecast.error}</div>
            ) : (
                <>
                    <div className="admin-user-card__chart-wrap" style={{ position: 'relative', height: '140px', width: '100%' }}>
                        {isLoading && (
                            <div className="graph-loading-overlay" style={{ borderRadius: '8px' }}>
                                <div className="loading-spinner" style={{ width: '24px', height: '24px', borderWidth: '2px' }} />
                            </div>
                        )}
                        <canvas ref={canvasRef} />
                    </div>
                    <div className="admin-user-card__stats">
                        <div className="admin-user-card__stat">
                            <span>Fatigue Gain</span>
                            {isLoading ? (
                                <div className="skeleton-text-bone" style={{ width: '50px', marginTop: '4px' }} />
                            ) : (
                                <strong>{k2.toFixed(5)}</strong>
                            )}
                        </div>
                        <div className="admin-user-card__stat">
                            <span>Decay</span>
                            {isLoading ? (
                                <div className="skeleton-text-bone" style={{ width: '50px', marginTop: '4px' }} />
                            ) : (
                                <strong>{tau2.toFixed(0)} days</strong>
                            )}
                        </div>
                        <div className="admin-user-card__stat">
                            <span>Error</span>
                            {isLoading ? (
                                <div className="skeleton-text-bone" style={{ width: '50px', marginTop: '4px' }} />
                            ) : (
                                <strong>{rmse !== null ? rmse.toFixed(2) : " —"}</strong>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FatigueUserCard;