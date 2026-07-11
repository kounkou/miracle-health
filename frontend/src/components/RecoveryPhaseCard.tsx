import React, { useEffect, useRef, useMemo } from 'react';
import { Chart as ChartJS } from "chart.js/auto";
import type { Plugin, ChartConfiguration } from "chart.js";


//
// Types
//

export interface RecoveryModel {
    k1: number;   // fitness ceiling (asymptotic gain)
    k2: number;   // initial fatigue/deconditioning magnitude
    tau1: number; // fitness build time-constant (days)
    tau2: number; // fatigue decay time-constant (days)
}

export interface RecoveryPhase {
    recoveryStart: number; // day readiness crosses zero
    walk: number;          // day readiness reaches 25% of peak
    run: number;           // day readiness reaches 50% of peak
    hiit: number;          // day readiness reaches 80% of peak
    peak: number;          // day readiness reaches ~99% of asymptote
    plateau: number;       // day the rate of change becomes negligible
}

interface ChartPoint {
    day: number;
    fitness: number;
    fatigue: number;
    readiness: number;
}

interface RecoveryPhaseCardProps {
    model: RecoveryModel;
    theme: "light" | "dark";
    title?: string;
}

interface ZoneDefinition {
    start: number;
    end: number | null; // null = extends to right edge of chart
    label: string;
    color: string;
}

interface MarkerDefinition {
    day: number;
    label: string;
    color: string;
}

//
// Mathematical Helpers
//
// fitness(t)   = k1 * (1 - e^(-t/tau1))   -> rises from 0, saturates toward k1
// fatigue(t)   = k2 * e^(-t/tau2)         -> starts at k2, decays toward 0
// readiness(t) = fitness(t) - fatigue(t)  -> monotonically increases toward k1
//

function fitnessCurve(day: number, k1: number, tau1: number): number {
    const t = Math.max(0, day);
    const safeTau1 = tau1 > 0 ? tau1 : 1e-6;
    return k1 * (1 - Math.exp(-t / safeTau1));
}

function fatigueCurve(day: number, k2: number, tau2: number): number {
    const t = Math.max(0, day);
    const safeTau2 = tau2 > 0 ? tau2 : 1e-6;
    return k2 * Math.exp(-t / safeTau2);
}

function readinessCurve(day: number, model: RecoveryModel): number {
    return (
        fitnessCurve(day, model.k1, model.tau1) -
        fatigueCurve(day, model.k2, model.tau2)
    );
}

function readinessDerivative(day: number, model: RecoveryModel): number {
    const t = Math.max(0, day);
    const safeTau1 = model.tau1 > 0 ? model.tau1 : 1e-6;
    const safeTau2 = model.tau2 > 0 ? model.tau2 : 1e-6;
    const fitnessSlope = (model.k1 / safeTau1) * Math.exp(-t / safeTau1);
    const fatigueSlope = (model.k2 / safeTau2) * Math.exp(-t / safeTau2);
    // fatigue is decaying, so -d(fatigue)/dt is positive; readiness' = fitness' - fatigue'
    return fitnessSlope + fatigueSlope;
}

//
// Generic monotonic bisection
//
// Both readiness(t) and (later) -readinessDerivative(t) are monotonic over
// the domain we care about, so a simple bisection search is sufficient and
// avoids pulling in a numerical library.
//

const SEARCH_MAX_DAY = 365;
const SEARCH_ITERATIONS = 60;

function bisectForTarget(
    fn: (day: number) => number,
    target: number,
    lo: number = 0,
    hi: number = SEARCH_MAX_DAY,
): number {
    // Assumes fn is non-decreasing over [lo, hi].
    if (fn(hi) < target) return hi; // never reaches target within range
    if (fn(lo) >= target) return lo;

    let low = lo;
    let high = hi;
    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
        const mid = (low + high) / 2;
        if (fn(mid) < target) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return (low + high) / 2;
}

//
// Phase Calculations
//

function findRecoveryStart(model: RecoveryModel): number {
    // First day readiness is non-negative (fitness has caught up to fatigue).
    const day = bisectForTarget((d) => readinessCurve(d, model), 0);
    return Math.max(0, Math.round(day));
}

function findPeakReadiness(model: RecoveryModel): number {
    // Readiness approaches k1 asymptotically; treat 99% of k1 as "peak".
    const asymptote = model.k1;
    const target = asymptote * 0.99;
    const day = bisectForTarget((d) => readinessCurve(d, model), target);
    return Math.round(day);
}

function findPlateau(model: RecoveryModel, peak: number): number {
    // Day after peak where the rate of change drops below a small epsilon,
    // i.e. the curve has effectively flattened out.
    const epsilon = Math.max(model.k1, 1) * 0.001;
    // readinessDerivative is monotonically decreasing, so search on its
    // negation to reuse the non-decreasing bisection helper.
    const day = bisectForTarget(
        (d) => -readinessDerivative(d, model),
        -epsilon,
        peak,
        SEARCH_MAX_DAY,
    );
    return Math.round(day);
}

function findThresholdDay(
    model: RecoveryModel,
    threshold: number,
    peakValue: number,
): number {
    const target = threshold * peakValue;
    const day = bisectForTarget((d) => readinessCurve(d, model), target);
    return Math.max(0, Math.round(day));
}

function calculateRecoveryPhases(model: RecoveryModel): RecoveryPhase {
    const peak = findPeakReadiness(model);
    const peakValue = readinessCurve(peak, model);

    const recoveryStart = findRecoveryStart(model);
    const walk = Math.max(recoveryStart, findThresholdDay(model, 0.25, peakValue));
    const run = Math.max(walk, findThresholdDay(model, 0.5, peakValue));
    const hiit = Math.max(run, findThresholdDay(model, 0.8, peakValue));
    const plateau = Math.max(peak, findPlateau(model, peak));

    return { recoveryStart, walk, run, hiit, peak, plateau };
}

//
// Chart Data Generation
//

function generateChartData(model: RecoveryModel): {
    labels: string[];
    fitness: number[];
    fatigue: number[];
    readiness: number[];
} {
    const phases = calculateRecoveryPhases(model);
    const totalDays = Math.min(180, Math.max(14, phases.plateau + 7));

    const labels: string[] = [];
    const fitness: number[] = [];
    const fatigue: number[] = [];
    const readiness: number[] = [];

    for (let day = 0; day <= totalDays; day++) {
        labels.push(`Day ${day}`);
        fitness.push(Number(fitnessCurve(day, model.k1, model.tau1).toFixed(2)));
        fatigue.push(Number(fatigueCurve(day, model.k2, model.tau2).toFixed(2)));
        readiness.push(Number(readinessCurve(day, model).toFixed(2)));
    }

    return { labels, fitness, fatigue, readiness };
}

//
// Chart Helpers
//

function createPhaseAnnotations(phases: RecoveryPhase): MarkerDefinition[] {
    return [
        { day: phases.recoveryStart, label: "Recovery Start", color: "#ef4444" },
        { day: phases.walk, label: "Walk", color: "#f59e0b" },
        { day: phases.run, label: "Run", color: "#eab308" },
        { day: phases.hiit, label: "HIIT", color: "#22c55e" },
        { day: phases.peak, label: "Peak", color: "#3b82f6" },
        { day: phases.plateau, label: "Plateau", color: "#8b5cf6" },
    ];
}

function createRecoveryZones(phases: RecoveryPhase): ZoneDefinition[] {
    return [
        { start: 0, end: phases.recoveryStart, label: "Rest", color: "rgba(239, 68, 68, 0.08)" },
        { start: phases.recoveryStart, end: phases.walk, label: "Recovery", color: "rgba(245, 158, 11, 0.08)" },
        { start: phases.walk, end: phases.run, label: "Walking", color: "rgba(234, 179, 8, 0.08)" },
        { start: phases.run, end: phases.hiit, label: "Running", color: "rgba(34, 197, 94, 0.08)" },
        { start: phases.hiit, end: phases.peak, label: "HIIT Training", color: "rgba(59, 130, 246, 0.08)" },
        { start: phases.peak, end: null, label: "Peak / Maintenance", color: "rgba(139, 92, 246, 0.08)" },
    ];
}

function createDatasets(chartData: ReturnType<typeof generateChartData>) {
    return [
        {
            label: "Fitness",
            data: chartData.fitness,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
        },
        {
            label: "Fatigue",
            data: chartData.fatigue,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
        },
        {
            label: "Readiness",
            data: chartData.readiness,
            borderColor: "#22c55e",
            backgroundColor: "rgba(34, 197, 94, 0.12)",
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
        },
    ];
}

//
// Custom Chart.js plugin: draws recovery zone bands + phase marker lines
// behind the datasets. Built per-render so it can close over the current
// zones/markers without touching global plugin registration.
//

function buildZonePlugin(
    zones: ZoneDefinition[],
    markers: MarkerDefinition[],
    textColor: string,
): Plugin<"line"> {
    return {
        id: "recoveryZonePlugin",
        beforeDatasetsDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const xScale = scales.x;
            if (!chartArea || !xScale) return;

            ctx.save();

            // Zone bands
            zones.forEach((zone) => {
                const startPx = xScale.getPixelForValue(zone.start);
                const endPx =
                    zone.end === null
                        ? chartArea.right
                        : xScale.getPixelForValue(zone.end);

                ctx.fillStyle = zone.color;
                ctx.fillRect(
                    startPx,
                    chartArea.top,
                    Math.max(0, endPx - startPx),
                    chartArea.bottom - chartArea.top,
                );
            });

            // Marker lines
            markers.forEach((marker) => {
                const x = xScale.getPixelForValue(marker.day);
                if (x < chartArea.left || x > chartArea.right) return;

                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = marker.color;
                ctx.lineWidth = 1.5;
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = textColor;
                ctx.font = "10px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(marker.label, x, chartArea.top - 4);
            });

            ctx.restore();
        },
    };
}

//
// Component
//

export const RecoveryPhaseCard: React.FC<RecoveryPhaseCardProps> = ({
    model,
    theme,
    title = "Recovery Phases",
}) => {
    //
    // Refs
    //

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<ChartJS | null>(null);

    //
    // Computed Data
    //

    const chartData = useMemo(() => generateChartData(model), [model]);
    const phases = useMemo(() => calculateRecoveryPhases(model), [model]);

    const isDark = theme === "dark";
    const textColor = isDark ? "#e5e7eb" : "#374151";
    const mutedTextColor = isDark ? "#9ca3af" : "#6b7280";
    const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

    //
    // Chart Lifecycle
    //

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
        }

        const zones = createRecoveryZones(phases);
        const markers = createPhaseAnnotations(phases);
        const datasets = createDatasets(chartData);
        const zonePlugin = buildZonePlugin(zones, markers, mutedTextColor);

        const config: ChartConfiguration<"line"> = {
            type: "line",
            data: {
                labels: chartData.labels,
                datasets,
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                layout: { padding: { top: 18 } },
                scales: {
                    x: {
                        ticks: {
                            color: mutedTextColor,
                            maxTicksLimit: 10,
                        },
                        grid: { color: gridColor },
                    },
                    y: {
                        ticks: { color: mutedTextColor },
                        grid: { color: gridColor },
                    },
                },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { color: textColor, usePointStyle: true, boxWidth: 8 },
                    },
                    tooltip: {
                        backgroundColor: isDark ? "#111827" : "#ffffff",
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                    },
                },
            },
            plugins: [zonePlugin],
        };

        chartRef.current = new ChartJS(canvas, config);

        return () => {
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [chartData, phases, theme, mutedTextColor, textColor, gridColor, isDark]);

    //
    // Render
    //

    const timelineEntries: { label: string; day: number; color: string }[] = [
        { label: "Recovery Start", day: phases.recoveryStart, color: "#ef4444" },
        { label: "Walk", day: phases.walk, color: "#f59e0b" },
        { label: "Run", day: phases.run, color: "#eab308" },
        { label: "HIIT", day: phases.hiit, color: "#22c55e" },
        { label: "Peak", day: phases.peak, color: "#3b82f6" },
        { label: "Plateau", day: phases.plateau, color: "#8b5cf6" },
    ];

    const peakValue = readinessCurve(phases.peak, model);

    return (
        <div
            className="admin-user-card"
            data-theme={theme}
            style={{
                background: isDark ? "#1f2937" : "#ffffff",
                color: textColor,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${gridColor}`,
            }}
        >
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: mutedTextColor }}>
                    Modeled fitness, fatigue, and readiness over the recovery window.
                </p>
            </div>

            {/* Chart */}
            <div style={{ position: "relative", height: 260, marginBottom: 20 }}>
                <canvas ref={canvasRef} />
            </div>

            {/* Recovery Timeline */}
            <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 8px", color: mutedTextColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Recovery Timeline
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {timelineEntries.map((entry) => (
                        <div
                            key={entry.label}
                            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: entry.color,
                                    display: "inline-block",
                                }}
                            />
                            <span style={{ color: mutedTextColor }}>{entry.label}:</span>
                            <span style={{ fontWeight: 600 }}>Day {entry.day}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Statistics */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                <div>
                    <div style={{ fontSize: 11, color: mutedTextColor }}>Peak Readiness</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{peakValue.toFixed(1)}</div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: mutedTextColor }}>Days to Peak</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{phases.peak}</div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: mutedTextColor }}>Days to Plateau</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{phases.plateau}</div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: mutedTextColor }}>HIIT-Ready</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>Day {phases.hiit}</div>
                </div>
            </div>

            {/* Optional Explanation */}
            <p style={{ fontSize: 12, lineHeight: 1.5, color: mutedTextColor, margin: 0 }}>
                Fitness builds gradually toward a ceiling of {model.k1.toFixed(0)} over roughly{" "}
                {model.tau1.toFixed(0)}-day cycles, while initial fatigue of {model.k2.toFixed(0)}{" "}
                decays over roughly {model.tau2.toFixed(0)} days. Readiness (fitness minus fatigue)
                crosses zero on day {phases.recoveryStart}, clearing progressively harder activity
                thresholds until it plateaus near day {phases.plateau}.
            </p>
        </div>
    );
};

export default RecoveryPhaseCard;