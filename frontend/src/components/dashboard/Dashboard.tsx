import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
    Chart as ChartJS,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler,
} from "chart.js";
import ZoomPlugin from "chartjs-plugin-zoom";
import ThemeControls from "../ThemeControls";
import type { AccentName, ThemeMode } from "../../theme";
import { API } from "../../lib/api";
import { CardioUserCard } from "../CardioUserCard"
import FatigueUserCard from "../FatigueUserCard";
import FitnessUserCard from "../FitnessUserCard";
import AdviceUserCard from "../AdviceUserCard";
import Onboarding from "../Onboarding";

ChartJS.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler,
    ZoomPlugin
);

interface DashboardProps {
    token: string;
    email: string;
    apiFetchWithAuth: (path: string, opts?: RequestInit) => Promise<any>;
    onLogout: () => void;
    theme: ThemeMode;
    accent: AccentName;
    onThemeChange: (theme: ThemeMode) => void;
    onAccentChange: (accent: AccentName) => void;
}

interface PredictorField {
    label: string;
    val: number;
    set: Dispatch<SetStateAction<number>>;
    step: number;
    min?: number;
    max?: number;
}

const WORKOUTS_AUTO_REFRESH_MS = 86400 * 1000;
const PHASE_ORDER = ["pre", "fatigue", "recovery", "supercompensation", "decay"];
const PHASE_LABELS: Record<string, string> = {
    pre: "Pre-HIIT",
    fatigue: "Fatigue",
    recovery: "Recovery",
    supercompensation: "Supercomp",
    decay: "Decay",
};
const INPUTS_STORAGE_KEY = "banister-health-inputs";

export interface Workout {
    id: number;
    date: string;
    activeCalories: number;
    workoutDuration: number;
    avgHeartRate: number;
    kilocalories: number;
    vo2maxMeasured: number;
    workoutType?: string;
    workoutTime?: string;
}

export interface HealthInputs {
    dob: string;
    sex: "male" | "female";
}

interface PhaseChartData {
    labels: string[];
    dayBuckets: number[];
    segmentPhases: string[];
    phaseColors: string[];
    phaseCssColors: Record<string, string>;
    fatigueEnd: number;
    recoveryEnd: number;
    supercompEnd: number;
    supercompToDecayIndices: number[];
}

interface ModelSignals {
    tau1: number;
    tau2: number;
    k1: number;
    k2: number;
    rmse1: number;
    rmse2: number;
    allLabels: string[];
    allDayBuckets: number[];
    allFitnessSignals: number[];
    allFatigueSignals: number[];
}

interface UserForecast {
    email: string;
    labels: string[];
    values: (number | null)[];
    peakVo2: number | null;
    nextHiitDay: number | null;
    nextZone2Day: number | null;
    nextZone1Day: number | null;
    error?: string;
}

interface FitnessForecast {
    values: (number | null)[];
    error?: string | null;
    k1: number | null; // Fitness gain rate
    tau1: number | null; // Fitness decay rate
    rmse: number | null; // Root Mean Square Error
}

interface FatigueForecast {
    values: (number | null)[];
    error?: string | null;
    k2: number | null; // Fatigue gain rate
    tau2: number | null; // Fatigue decay rate
    rmse: number | null; // Root Mean Square Error
}

type Vo2maxThresholds = { lowMax: number; belowAvgMax: number; aboveAvgMax: number };

function getVo2maxThresholds(ageVal: number, sexVal: "male" | "female"): Vo2maxThresholds {
    if (sexVal === "female") {
        if (ageVal < 30) return { lowMax: 29, belowAvgMax: 37, aboveAvgMax: 46 };
        if (ageVal < 40) return { lowMax: 24, belowAvgMax: 29, aboveAvgMax: 37 };
        if (ageVal < 50) return { lowMax: 21, belowAvgMax: 26, aboveAvgMax: 33 };
        if (ageVal < 60) return { lowMax: 19, belowAvgMax: 22, aboveAvgMax: 28 };
        return { lowMax: 15, belowAvgMax: 19, aboveAvgMax: 24 };
    }
    // male (ACSM norms)
    if (ageVal < 30) return { lowMax: 33, belowAvgMax: 42, aboveAvgMax: 51 };
    if (ageVal < 40) return { lowMax: 34, belowAvgMax: 42, aboveAvgMax: 49 };
    if (ageVal < 50) return { lowMax: 29, belowAvgMax: 37, aboveAvgMax: 45 };
    if (ageVal < 60) return { lowMax: 25, belowAvgMax: 35, aboveAvgMax: 41 };
    return { lowMax: 23, belowAvgMax: 32, aboveAvgMax: 37 };
}

function generateDynamicHIITSegments(params) {
    // --- FIX: DYNAMIC WORK DURATION BASED ON ATHLETE PROFILE ---
    // If fatigue outweighs fitness heavily (> 3.0), they are an "Endurance/Slow Recovery" profile.
    // They get shorter, highly focused 3-minute intervals.
    // If they resist fatigue incredibly well (< 1.5), they are an "Elite/Resilient" profile.
    // They get extended 5-minute intervals to maximize stress. Otherwise, standard 4 minutes.
    const fatigueFitnessRatio = params.k2 / params.k1;
    const workDurationSeconds = (fatigueFitnessRatio > 3.0) ? 180 : (fatigueFitnessRatio < 1.5) ? 300 : 240;

    const workTargetIntensity = (fatigueFitnessRatio > 3.0) ? 85.0 : (fatigueFitnessRatio < 1.5) ? 95.0 : 90.0;

    // Tailor Recovery Time using Fatigue Decay (tau2)
    const restDurationSeconds = (params.tau2 > 20.0) ? 240 : (params.tau2 < 10.0) ? 120 : 180;
    const restTargetIntensity = (params.tau2 > 18.0) ? 55.0 : 65.0;

    // The basic 10-segment structure now uses the dynamic workDurationSeconds
    const segments = [
        { name: "Warmup (Zone 2)", durationSeconds: 600, targetIntensity: 60.0 },
        { name: "Zone 5", durationSeconds: workDurationSeconds, targetIntensity: workTargetIntensity },
        { name: "Rest", durationSeconds: restDurationSeconds, targetIntensity: restTargetIntensity },
        { name: "Zone 5", durationSeconds: workDurationSeconds, targetIntensity: workTargetIntensity },
        { name: "Rest", durationSeconds: restDurationSeconds, targetIntensity: restTargetIntensity },
        { name: "Zone 5", durationSeconds: workDurationSeconds, targetIntensity: workTargetIntensity },
        { name: "Rest", durationSeconds: restDurationSeconds, targetIntensity: restTargetIntensity },
        { name: "Zone 5", durationSeconds: workDurationSeconds, targetIntensity: workTargetIntensity },
        { name: "Rest", durationSeconds: restDurationSeconds, targetIntensity: restTargetIntensity },
        { name: "Cooldown (Zone 2)", durationSeconds: 300, targetIntensity: 50.0 }
    ];

    const summaryData = [];

    // Scale parameters to handle short workout durations cleanly
    const scaleFactor = 100.0;
    let currentFitnessInfluence = 0;
    let currentFatigueInfluence = 0;
    const dtMinutes = 1.0 / 60.0;

    for (const seg of segments) {
        const inputStimulus = Math.pow(seg.targetIntensity / 100.0, 2);

        for (let sec = 0; sec < seg.durationSeconds; sec++) {
            currentFitnessInfluence += (params.k1 * inputStimulus - currentFitnessInfluence / params.tau1) * dtMinutes;
            currentFatigueInfluence += (params.k2 * inputStimulus - currentFatigueInfluence / params.tau2) * dtMinutes;
        }

        // Physiological engine: baseline intensity modified by the net stress accumulation
        let calculatedIntensity = seg.targetIntensity + ((currentFitnessInfluence - currentFatigueInfluence) * scaleFactor);

        // Keep values constrained to realistic human limits
        if (calculatedIntensity > 100.0) calculatedIntensity = 100.0;
        if (calculatedIntensity < 35.0) calculatedIntensity = seg.targetIntensity * 0.9;

        summaryData.push({
            segment: seg.name,
            durationSeconds: seg.durationSeconds,
            targetIntensity: seg.targetIntensity,
            intensity: Math.round(calculatedIntensity * 100) / 100
        });
    }

    return summaryData;
}

/*
    Zone 2 Duration: Base of 60 minutes, scaled by the ratio of fitness to fatigue (k1/k2) and recovery speed (tau1/tau2).
    Zone 1 Duration: Base of 60 minutes, scaled by the recovery capacity, which is influenced by both the fitness-to-fatigue ratio and the recovery speed ratio.
*/
function calculateZone1Duration(params) {
    if (params.k1 <= 0 || params.k2 <= 0 || params.tau1 <= 0 || params.tau2 <= 0) {
        return 60;
    }

    const recoveryCapacity = Math.sqrt((params.k1 / params.k2) * (params.tau2 / params.tau1));
    const duration = 60 + 60 * recoveryCapacity;

    return Math.max(30, Math.min(180, Math.round(duration)));
}

function calculateZone2Duration(params) {
    const adaptationRate = params.k1 / params.k2;
    const recoveryFactor = Math.sqrt(params.tau1 / params.tau2);
    const duration = 60 * adaptationRate * recoveryFactor;

    return Math.max(30, Math.min(120, duration));
}

function classifyVo2max(vo2maxVal: number, ageVal: number, sexVal: "male" | "female"): "Low" | "Below Average" | "Above Average" | "High" {
    const t = getVo2maxThresholds(ageVal, sexVal);
    if (vo2maxVal > t.aboveAvgMax) return "High";
    if (vo2maxVal > t.belowAvgMax) return "Above Average";
    if (vo2maxVal > t.lowMax) return "Below Average";
    return "Low";
}

function computeForecastFromAPI(inputs: HealthInputs, token: string, trainingMode: "Wellness" | "Maintenance" | "Athletic Building")
    : Promise<{
        isLockedOut: boolean;
        resetSeconds: number;
        labels: string[];
        dayBuckets: number[];
        actualPoints: { x: number; y: number }[];
        workoutTypeLabels: string[];
        peakValue: number;
        peakT: number;
        nextHiitDay: number | null;
        nextZone2Day: number | null;
        nextZone1Day: number | null;
        phaseBoundaries: { fatigueEnd: number; recoveryEnd: number; supercompEnd: number } | null;
        modelSignals: ModelSignals
    }> {
    return (async () => {
        try {
            const response = await fetch(`${API}/me/forecast`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ healthInputs: inputs, trainingMode }),
            });

            const isLockedOut = response.headers.get("X-RateLimit-Lockout") === "true";
            const resetSeconds = parseInt(response.headers.get("X-RateLimit-Reset") || "300", 10);

            if (!response.ok) {
                throw new Error(`Forecast API failed with status ${response.status}`);
            }

            const forecast = await response.json();
            const labels: string[] = [];
            const dayBuckets: number[] = [];
            const actualPoints: { x: number; y: number }[] = [];
            const workoutTypeLabels: string[] = [];
            const seenDayBuckets = new Set<number>();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let peakValue = Number(forecast.peakVo2);
            let peakT = Number(forecast.peakDay);
            const nextHiitDay = typeof forecast.nextHiitDay === "number" && Number.isFinite(forecast.nextHiitDay) ? Number(forecast.nextHiitDay) : null;
            const nextZone2Day = typeof forecast.nextZone2Day === "number" && Number.isFinite(forecast.nextZone2Day) ? Number(forecast.nextZone2Day) : null;
            const nextZone1Day = typeof forecast.nextZone1Day === "number" && Number.isFinite(forecast.nextZone1Day) ? Number(forecast.nextZone1Day) : null;
            const phaseBoundariesRaw = forecast.phaseBoundaries;
            const phaseBoundaries = phaseBoundariesRaw &&
                typeof phaseBoundariesRaw.fatigueEnd === "number" && Number.isFinite(phaseBoundariesRaw.fatigueEnd) &&
                typeof phaseBoundariesRaw.recoveryEnd === "number" && Number.isFinite(phaseBoundariesRaw.recoveryEnd) &&
                typeof phaseBoundariesRaw.supercompEnd === "number" && Number.isFinite(phaseBoundariesRaw.supercompEnd)
                ? {
                    fatigueEnd: Number(phaseBoundariesRaw.fatigueEnd),
                    recoveryEnd: Number(phaseBoundariesRaw.recoveryEnd),
                    supercompEnd: Number(phaseBoundariesRaw.supercompEnd),
                }
                : null;

            for (const point of forecast.points) {
                const day = Number(point.day);
                const actualRaw = point.actual;
                const hasActual = typeof actualRaw === "number" && Number.isFinite(actualRaw);
                const dayBucket = Math.round(day);

                if (!hasActual && dayBucket !== 0 && (dayBucket < 1 || dayBucket > 3)) {
                    continue;
                }

                if (seenDayBuckets.has(dayBucket)) {
                    continue;
                }
                seenDayBuckets.add(dayBucket);

                const labelDate = new Date(today);
                labelDate.setDate(today.getDate() + dayBucket);
                const label = dayBucket === 0
                    ? "Today"
                    : labelDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

                const xIndex = labels.length;
                labels.push(label);
                dayBuckets.push(dayBucket);
                const pointWorkoutType = typeof point.workoutTypeLabel === "string" ? point.workoutTypeLabel.trim() : "";
                workoutTypeLabels.push(pointWorkoutType);
                if (hasActual) {
                    actualPoints.push({ x: xIndex, y: actualRaw });
                }
            }

            // Build dense model signal arrays (every day in the forecast window)
            const allLabels: string[] = [];
            const allDayBuckets: number[] = [];
            const allFitnessSignals: number[] = [];
            const allFatigueSignals: number[] = [];
            const seenModelDays = new Set<number>();
            for (const point of forecast.points) {
                const dayBucket = Math.round(Number(point.day));
                if (dayBucket > 0) continue; // only up to today
                if (seenModelDays.has(dayBucket)) continue;
                seenModelDays.add(dayBucket);
                const labelDate = new Date(today);
                labelDate.setDate(today.getDate() + dayBucket);
                const label = dayBucket === 0 ? "Today" : labelDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                allLabels.push(label);
                allDayBuckets.push(dayBucket);
                allFitnessSignals.push(typeof point.fitnessSignal === "number" ? point.fitnessSignal : 0);
                allFatigueSignals.push(typeof point.fatigueSignal === "number" ? point.fatigueSignal : 0);
            }

            // if (!Number.isFinite(peakValue)) {
            //     peakValue = inputs.vo2max;
            // }
            if (!Number.isFinite(peakT) || peakT <= 0) {
                peakT = 1;
            }

            return {
                isLockedOut, resetSeconds, labels, dayBuckets, actualPoints, workoutTypeLabels, peakValue, peakT, nextHiitDay, nextZone2Day, nextZone1Day, phaseBoundaries, modelSignals: {
                    tau1: typeof forecast.tau1 === "number" ? forecast.tau1 : 35,
                    tau2: typeof forecast.tau2 === "number" ? forecast.tau2 : 7,
                    k1: typeof forecast.k1 === "number" ? forecast.k1 : 0.02,
                    k2: typeof forecast.k2 === "number" ? forecast.k2 : 0.06,
                    rmse1: typeof forecast.rmse1 === "number" ? forecast.rmse1 : 0,
                    rmse2: typeof forecast.rmse2 === "number" ? forecast.rmse2 : 0,
                    allLabels,
                    allDayBuckets,
                    allFitnessSignals,
                    allFatigueSignals,
                }
            };
        } catch (err) {
            console.error("Forecast API error:", err);
            throw err;
        }
    })();
}

function PasswordInput({
    icon,
    visible,
    onToggleVisibility,
    ...props
}: {
    icon: React.ReactNode;
    visible: boolean;
    onToggleVisibility: () => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="input-wrap password-wrap">
            <span className="input-icon">{icon}</span>
            <input {...props} type={visible ? "text" : "password"} />
            <button
                type="button"
                className="password-toggle"
                onClick={onToggleVisibility}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
            >
                {visible ? "Hide" : "Show"}
            </button>
        </div>
    );
}

export default function Dashboard({
    token,
    email,
    apiFetchWithAuth,
    onLogout,
    theme,
    accent,
    onThemeChange,
    onAccentChange }: DashboardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<ChartJS<"line"> | null>(null);
    const phaseChartRef = useRef<ChartJS<"line"> | null>(null);
    const workoutsSignatureRef = useRef("");
    const previousTokenRef = useRef<string | null>(null);
    const [vo2max, setVo2max] = useState(0);
    const [hrvBaseline, setHrvBaseline] = useState(0);
    const [restingHeartRateBaseline, setRestingHeartRateBaseline] = useState(0);
    const [maxHeartRate, setMaxHeartRate] = useState(0);
    const [cardioRecoveryBaseline, setCardioRecoveryBaseline] = useState(0);
    const [hasLoadedHealthInputs, setHasLoadedHealthInputs] = useState(false);
    const [peakDay, setPeakDay] = useState<number | null>(null);
    const [peakVo2, setPeakVo2] = useState<number | null>(null);
    const [computedInputs, setComputedInputs] = useState<HealthInputs>({
        dob: "",
        sex: "male"
    });
    const [workouts, setWorkouts] = useState<Workout[]>([]);
    const [wDate, setWDate] = useState(new Date().toISOString().slice(0, 10));
    const [wActiveCalories, setWActiveCalories] = useState(0);
    const [wWorkoutDuration, setWWorkoutDuration] = useState(0);
    const [wAvgHeartRate, setWAvgHeartRate] = useState(0);
    const [wKilocalories, setWKilocalories] = useState(0);
    const [wVo2maxMeasured, setWVo2maxMeasured] = useState(0);
    const [wWorkoutType, setWWorkoutType] = useState<string>("zone2");
    const [wWorkoutTime, setWWorkoutTime] = useState("");
    const [wAdding, setWAdding] = useState(false);
    const [wModalOpen, setWModalOpen] = useState(false);
    const [metricsModalOpen, setMetricsModalOpen] = useState(false);
    const [pwModalOpen, setPwModalOpen] = useState(false);
    const [pwCurrent, setPwCurrent] = useState("");
    const [pwNew, setPwNew] = useState("");
    const [pwConfirm, setPwConfirm] = useState("");
    const [pwError, setPwError] = useState("");
    const [pwSuccess, setPwSuccess] = useState("");
    const [pwLoading, setPwLoading] = useState(false);
    const [wError, setWError] = useState("");
    const [wSuccess, setWSuccess] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValues, setEditValues] = useState<Partial<Workout>>({});
    const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
    const [pictureLoading, setPictureLoading] = useState(false);
    const [dashboardReady, setDashboardReady] = useState(false);
    const [chartLoading, setChartLoading] = useState(false);
    const [nextHiitDayState, setNextHiitDay] = useState<number | null>(null);
    const [nextZone2DayState, setNextZone2Day] = useState<number | null>(null);
    const [nextZone1DayState, setNextZone1Day] = useState<number | null>(null);

    const [sex, setSex] = useState<"male" | "female">(() => {
        const s = localStorage.getItem("vo2max-sex");
        return s === "female" ? "female" : "male";
    });

    const [dob, setDob] = useState<string>(() => {
        const s = localStorage.getItem("vo2max-dob");
        return s ? s : new Date().toISOString().slice(0, 10);
    });

    const [userForecast, setUserForecast] = useState<UserForecast | null>(null);
    const [fitnessForecast, setFitnessForecast] = useState<FitnessForecast | null>(null);
    const [fatigueForecast, setFatigueForecast] = useState<FatigueForecast | null>(null);

    const [isOnboardingComplete, setIsOnboardingComplete] = useState(false)
    const [canDisplayOnboardingPopup, setCanDisplayOnboardingPopup] = useState(false);

    const [trainingMode, setTrainingMode] = useState<"Wellness" | "Maintenance" | "Athletic Building">("Maintenance");
    const trainingModeRef = useRef<"Wellness" | "Maintenance" | "Athletic Building">("Maintenance");
    const [chartView, setChartView] = useState<"day" | "week" | "month" | "year">("week");
    const chartViewRef = useRef<"day" | "week" | "month" | "year">("week");
    const [modelChartView, setModelChartView] = useState<"vo2max" | "k1" | "k2" | "tau1" | "tau2" | "phases">("vo2max");
    const modelChartViewRef = useRef<"vo2max" | "k1" | "k2" | "tau1" | "tau2" | "phases">("vo2max");
    const modelDataRef = useRef<ModelSignals | null>(null);
    const phaseDataRef = useRef<PhaseChartData | null>(null);
    const chartLabelsRef = useRef<string[]>([]);
    const chartDayBucketsRef = useRef<number[]>([]);
    const computedInputsRef = useRef<HealthInputs>(computedInputs);
    computedInputsRef.current = computedInputs;
    const [modelSignalsDisplay, setModelSignalsDisplay] = useState<ModelSignals | null>(null);
    const [metricsOpen, setMetricsOpen] = useState(false);
    const [workoutStructureRecommendationOpen, setWorkoutStructureRecommendationOpen] = useState(false);
    const [dayViewDate, setDayViewDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const dayViewDateRef = useRef<string>(new Date().toISOString().slice(0, 10));
    const workoutsRef = useRef<Workout[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const authHeader = { Authorization: `Bearer ${token}` };
    const latestActualVo2max = workouts
        .filter(w => w.vo2maxMeasured > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.vo2maxMeasured;
    const peakDateLabel = peakDay !== null ? formatFutureDateLabel(peakDay) : null;
    const nextHiitDateLabel = nextHiitDayState !== null ? formatFutureDateLabel(nextHiitDayState) : null;
    const nextZone2DateLabel = nextZone2DayState !== null ? formatFutureDateLabel(nextZone2DayState) : null;
    const nextZone1DateLabel = nextZone1DayState !== null ? formatFutureDateLabel(nextZone1DayState) : null;
    const displayedWorkouts = [...workouts].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.id - a.id;
    });
    const fields: PredictorField[] = [
        { label: "VO\u2082max (mL/kg/min)", val: vo2max, set: setVo2max, step: 0.1 },
        { label: "HRV Baseline (ms)", val: hrvBaseline, set: setHrvBaseline, step: 1, min: 1 },
        { label: "Resting HR Baseline (ms)", val: restingHeartRateBaseline, set: setRestingHeartRateBaseline, step: 1, min: 1 },
        { label: "Max Heart Rate (bpm)", val: maxHeartRate, set: setMaxHeartRate, step: 1, min: 1 },
        { label: "Cardio Recovery Baseline (ms)", val: cardioRecoveryBaseline, set: setCardioRecoveryBaseline, step: 1, min: 1 },
    ];

    const VIEW_WINDOW: Record<"week" | "month" | "year", number> = { week: 7, month: 30, year: 365 };

    const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
    const [isRateLimited, setIsRateLimited] = useState<boolean>(false);

    const zone1Duration = modelSignalsDisplay ? calculateZone1Duration(modelSignalsDisplay) : null;
    const zone2Duration = modelSignalsDisplay ? calculateZone2Duration(modelSignalsDisplay) : null;

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleOnboardingSubmit = () => {
        const computedInputs = { sex: sex, dob: dob };

        runCompute(computedInputs);
        setOnboardingStatusAPI(true);
        setIsOnboardingComplete(true);
    };

    function applyChartView(view: "week" | "month" | "year") {
        const chart = chartRef.current;
        const phaseChart = phaseChartRef.current;
        const labels = chartLabelsRef.current;
        const dayBuckets = chartDayBucketsRef.current;
        if (!chart || labels.length === 0) return;

        const windowDays = VIEW_WINDOW[view];
        let centerIdx = dayBuckets.findIndex((b) => b === 0);
        if (centerIdx < 0) centerIdx = dayBuckets.findIndex((b) => b >= 0);
        if (centerIdx < 0) centerIdx = labels.length - 1;

        const halfWindow = Math.floor(windowDays / 2);
        let minIdx = Math.max(0, centerIdx - halfWindow);
        let maxIdx = Math.min(labels.length - 1, minIdx + windowDays - 1);
        minIdx = Math.max(0, maxIdx - (windowDays - 1));

        const minLabel = labels[minIdx];
        const maxLabel = labels[maxIdx];

        chart.options.scales!.x!.min = minLabel;
        chart.options.scales!.x!.max = maxLabel;
        chart.update("none");

        if (phaseChart) {
            phaseChart.options.scales!.x!.min = minLabel;
            phaseChart.options.scales!.x!.max = maxLabel;
            phaseChart.update("none");
        }
    }

    function buildDayViewChart(date: string, workoutsArr: Workout[]) {
        const ctx = canvasRef.current;
        if (!ctx) return;
        if (chartRef.current) chartRef.current.destroy();
        if (phaseChartRef.current) {
            phaseChartRef.current.destroy();
            phaseChartRef.current = null;
        }
        const styles = getComputedStyle(document.documentElement);
        const muted = styles.getPropertyValue("--muted").trim() || "#7c8099";
        const border = styles.getPropertyValue("--border").trim() || "#2a2c38";
        const text = styles.getPropertyValue("--text").trim() || "#e8eaf0";
        const accentColor = styles.getPropertyValue("--accent").trim();
        const accentRgb = styles.getPropertyValue("--accent-rgb").trim();
        const hiitLabelColor = styles.getPropertyValue("--hiit-label").trim() || "#ef4444";

        const hourLabels = Array.from({ length: 24 }, (_, h) => {
            if (h === 0) return "12 AM";
            if (h < 12) return `${h} AM`;
            if (h === 12) return "12 PM";
            return `${h - 12} PM`;
        });

        const dateWorkouts = workoutsArr.filter(w => w.date === date);
        const actualPoints: { x: number; y: number }[] = [];
        const typeLabels: string[] = [];
        const typeLabelColors: string[] = [];

        dateWorkouts.forEach((w, i) => {
            let hour: number;
            if (w.workoutTime && /^\d{2}:\d{2}$/.test(w.workoutTime)) {
                hour = parseInt(w.workoutTime.split(":")[0], 10);
            } else {
                hour = Math.min(8 + i * 4, 22);
            }
            if (w.vo2maxMeasured > 0) {
                const label = w.workoutType === "hiit" ? "HIIT" : w.workoutType === "zone1" ? "Walk" : "Run";
                actualPoints.push({ x: hour, y: w.vo2maxMeasured });
                typeLabels.push(label);
                typeLabelColors.push(w.workoutType === "hiit" ? hiitLabelColor : muted);
            }
        });

        const maxVo2 = actualPoints.length > 0 ? Math.max(...actualPoints.map(p => p.y)) + 2 : 60;
        const minVo2 = actualPoints.length > 0 ? Math.max(0, Math.min(...actualPoints.map(p => p.y)) - 3) : 40;

        const labelPlugin = {
            id: "dayViewLabels",
            afterDatasetsDraw(chart: any) {
                const meta = chart.getDatasetMeta(0);
                if (!meta || meta.hidden) return;
                const chartCtx = chart.ctx;
                chartCtx.save();
                chartCtx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
                chartCtx.textAlign = "center";
                chartCtx.textBaseline = "bottom";
                meta.data.forEach((pointEl: any, idx: number) => {
                    const label = typeLabels[idx];
                    if (!label) return;
                    chartCtx.fillStyle = typeLabelColors[idx];
                    const pt = pointEl.getProps(["x", "y"], true);
                    chartCtx.fillText(label, pt.x, pt.y - 8);
                });
                chartCtx.restore();
            },
        };

        const [year, month, day] = date.split("-").map(Number);
        const dateTitle = new Date(year, month - 1, day).toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric",
        });

        chartRef.current = new ChartJS<"line">(ctx, {
            type: "line",
            data: {
                labels: hourLabels,
                datasets: [{
                    label: "VO\u2082max",
                    data: actualPoints,
                    borderColor: accentColor,
                    backgroundColor: `rgba(${accentRgb}, 0.15)`,
                    borderWidth: 0,
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    pointBackgroundColor: accentColor,
                    showLine: false,
                }],
            },
            plugins: [labelPlugin],
            options: {
                responsive: true,
                layout: { padding: { top: 24 } },
                scales: {
                    x: {
                        title: { display: true, text: dateTitle, color: muted },
                        ticks: { color: muted, maxTicksLimit: 12 },
                        grid: { color: border },
                    },
                    y: {
                        title: { display: true, text: "VO\u2082max (mL/kg/min)", color: muted },
                        ticks: { color: muted },
                        grid: { color: border },
                        max: maxVo2,
                        min: minVo2,
                    },
                },
                plugins: {
                    legend: { labels: { color: text } },
                    zoom: {
                        pan: { enabled: false },
                        zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: "x" },
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => items.length > 0 ? (hourLabels[Math.round((items[0] as any).parsed.x)] ?? "") : "",
                            label: (item) => {
                                const label = typeLabels[item.dataIndex] ?? "";
                                return `${label}: ${(item.parsed.y as number).toFixed(2)} mL/kg/min`;
                            },
                        },
                    },
                },
            },
        });
    }

    function navigateDayView(delta: number) {
        const [y, m, d] = dayViewDateRef.current.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + delta);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dt > today) return;
        const newDate = dt.toISOString().slice(0, 10);
        setDayViewDate(newDate);
        dayViewDateRef.current = newDate;
        buildDayViewChart(newDate, workoutsRef.current);
    }

    function buildPhasesChart() {
        const ctx = canvasRef.current;
        if (!ctx) return;
        if (chartRef.current) chartRef.current.destroy();
        if (phaseChartRef.current) { phaseChartRef.current.destroy(); phaseChartRef.current = null; }

        const pd = phaseDataRef.current;
        if (!pd || pd.labels.length === 0) return;

        const styles = getComputedStyle(document.documentElement);
        const muted = styles.getPropertyValue("--muted").trim() || "#7c8099";
        const border = styles.getPropertyValue("--border").trim() || "#2a2c38";
        const text = styles.getPropertyValue("--text").trim() || "#e8eaf0";

        const { labels, dayBuckets, segmentPhases, phaseColors, phaseCssColors, fatigueEnd, recoveryEnd, supercompEnd, supercompToDecayIndices } = pd;

        const phaseYValue: Record<string, number> = { pre: 0, fatigue: 1, recovery: 2, supercompensation: 3, decay: 4 };
        const phaseYLabel: Record<number, string> = { 0: "Pre-HIIT", 1: "Fatigue", 2: "Recovery", 3: "Supercomp", 4: "Decay" };

        const segs: any[] = labels.slice(0, -1).map((_, i) => {
            const phase = segmentPhases[i] || "decay";
            const y = phaseYValue[phase] ?? phaseYValue.decay;
            return {
                label: phase,
                data: labels.map((_l, idx) => (idx === i || idx === i + 1 ? y : Number.NaN)),
                borderColor: phaseColors[i] || phaseCssColors.decay,
                borderWidth: 14,
                borderCapStyle: "round" as const,
                borderJoinStyle: "round" as const,
                pointRadius: 0,
                tension: 0,
                spanGaps: false,
                fill: false,
            };
        });
        for (const scIdx of supercompToDecayIndices) {
            segs.push({
                label: "Decay starts",
                data: labels.map((_l, idx) => (idx === scIdx + 1 ? phaseYValue.decay : Number.NaN)),
                borderWidth: 0,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointBackgroundColor: "rgba(255,255,255,0.95)",
                pointBorderColor: phaseCssColors.decay,
                pointBorderWidth: 2,
                showLine: false,
            });
        }

        const viewKey = (chartViewRef.current === "day" ? "week" : chartViewRef.current) as "week" | "month" | "year";
        const windowDays = VIEW_WINDOW[viewKey];
        let centerIdx = dayBuckets.findIndex((b) => b === 0);
        if (centerIdx < 0) centerIdx = dayBuckets.findIndex((b) => b >= 0);
        if (centerIdx < 0) centerIdx = labels.length - 1;
        const halfWindow = Math.floor(windowDays / 2);
        let minIdx = Math.max(0, centerIdx - halfWindow);
        let maxIdx = Math.min(labels.length - 1, minIdx + windowDays - 1);
        minIdx = Math.max(0, maxIdx - (windowDays - 1));

        chartRef.current = new ChartJS<"line">(ctx, {
            type: "line",
            data: { labels, datasets: segs },
            options: {
                responsive: true,
                layout: { padding: { top: 20 } },
                scales: {
                    x: {
                        title: { display: true, text: "Date", color: muted },
                        ticks: { color: muted, maxTicksLimit: 11 },
                        grid: { color: border },
                        min: labels[minIdx],
                        max: labels[maxIdx],
                    },
                    y: {
                        title: { display: true, text: "Recovery Phase", color: muted },
                        ticks: {
                            color: muted,
                            stepSize: 1,
                            callback: (value) => phaseYLabel[value as number] ?? "",
                        },
                        grid: { color: border },
                        min: -0.5,
                        max: 4.5,
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: "nearest" as const,
                        intersect: false,
                        filter: (tooltipItem, index, tooltipItems) => {
                            const lbl = String(tooltipItem.dataset.label || "");
                            if (lbl === "Decay starts") return true;
                            return tooltipItems.findIndex((item) => String(item.dataset.label || "") === lbl) === index;
                        },
                        callbacks: {
                            title: (items) => items.length > 0 ? (labels[items[0].dataIndex] ?? "") : "",
                            label: (ctx) => {
                                const phase = (ctx.dataset as any).label || "decay";
                                if (phase === "Decay starts") return `Supercomp ends / Decay starts`;
                                if (phase === "pre") return `${PHASE_LABELS[phase]}: before HIIT`;
                                const phaseDurations: Record<string, string> = {
                                    fatigue: `0–${Math.round(fatigueEnd)} days post-HIIT`,
                                    recovery: `${Math.round(fatigueEnd)}–${Math.round(recoveryEnd)} days post-HIIT`,
                                    supercompensation: `${Math.round(recoveryEnd)}–${Math.round(supercompEnd)} days post-HIIT`,
                                    decay: `${Math.round(supercompEnd)}+ days post-HIIT`,
                                };
                                return `${PHASE_LABELS[phase] || phase}: ${phaseDurations[phase] || ""}`;
                            },
                        },
                    },
                    zoom: {
                        pan: { enabled: true, mode: "x" },
                        zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: "x" },
                    },
                },
            },
        });

        // Legend
        const legendEl = document.querySelector<HTMLDivElement>(".phase-legend");
        if (legendEl) legendEl.style.display = "flex";
    }

    function buildModelChart(view: "k1" | "k2" | "tau1" | "tau2") {
        const ctx = canvasRef.current;
        if (!ctx) return;
        if (chartRef.current) chartRef.current.destroy();
        if (phaseChartRef.current) { phaseChartRef.current.destroy(); phaseChartRef.current = null; }

        const styles = getComputedStyle(document.documentElement);
        const muted = styles.getPropertyValue("--muted").trim() || "#7c8099";
        const border = styles.getPropertyValue("--border").trim() || "#2a2c38";
        const text = styles.getPropertyValue("--text").trim() || "#e8eaf0";
        const accentColor = styles.getPropertyValue("--accent").trim();
        const accentRgb = styles.getPropertyValue("--accent-rgb").trim();

        if (view === "tau1" || view === "tau2") {
            const tau = view === "tau1" ? (modelDataRef.current?.tau1 ?? 35) : (modelDataRef.current?.tau2 ?? 7);
            const halfLifeDays = tau * Math.LN2;
            const baseMaxDays = view === "tau1" ? 90 : 30;
            const title = view === "tau1"
                ? `Fitness Decay  τ₁ = ${tau.toFixed(1)} days  (half-life ≈ ${halfLifeDays.toFixed(1)} d)`
                : `Fatigue Decay  τ₂ = ${tau.toFixed(1)} days  (half-life ≈ ${halfLifeDays.toFixed(1)} d)`;

            // Find last HIIT workout date
            let lastHiitDate: Date | null = null;
            for (const wo of workoutsRef.current) {
                if (wo.workoutType === "hiit") {
                    const d = new Date(wo.date + "T00:00:00");
                    if (!lastHiitDate || d > lastHiitDate) lastHiitDate = d;
                }
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysSince = lastHiitDate
                ? Math.max(0, Math.round((today.getTime() - lastHiitDate.getTime()) / 86400000))
                : 0;
            const maxDays = lastHiitDate ? Math.max(baseMaxDays, daysSince + 7) : baseMaxDays;
            const todayIdx = lastHiitDate ? Math.min(daysSince, maxDays) : null;

            const decayLabels: string[] = Array.from({ length: maxDays + 1 }, (_, i) => {
                if (!lastHiitDate) return `Day ${i}`;
                const d = new Date(lastHiitDate);
                d.setDate(d.getDate() + i);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            });
            const decayData = Array.from({ length: maxDays + 1 }, (_, i) => Math.exp(-i / tau));
            const pointRadii = decayData.map((_, i) => (todayIdx !== null && i === todayIdx ? 7 : 0));
            const pointColors = decayData.map((_, i) => (todayIdx !== null && i === todayIdx ? text : accentColor));

            const vlinePlugin = todayIdx !== null
                ? {
                    id: "vline-today",
                    afterDatasetsDraw(chart: any) {
                        const { ctx: c, chartArea, scales } = chart;
                        const xPx = scales.x.getPixelForValue(todayIdx);
                        c.save();
                        c.beginPath();
                        c.moveTo(xPx, chartArea.top);
                        c.lineTo(xPx, chartArea.bottom);
                        c.strokeStyle = "rgba(255,255,255,0.22)";
                        c.lineWidth = 1.5;
                        c.setLineDash([4, 4]);
                        c.stroke();
                        c.restore();
                    },
                }
                : null;

            chartRef.current = new ChartJS<"line">(ctx, {
                type: "line",
                data: {
                    labels: decayLabels,
                    datasets: [{
                        label: title,
                        data: decayData,
                        borderColor: accentColor,
                        backgroundColor: `rgba(${accentRgb}, 0.12)`,
                        borderWidth: 2,
                        pointRadius: pointRadii,
                        pointHoverRadius: pointRadii.map(r => r > 0 ? r + 2 : 4),
                        pointBackgroundColor: pointColors,
                        pointBorderColor: "transparent",
                        tension: 0,
                        fill: true,
                    }],
                },
                options: {
                    responsive: true,
                    scales: {
                        x: {
                            title: { display: true, text: lastHiitDate ? "Date (since last HIIT)" : "Days since workout", color: muted },
                            ticks: { color: muted, maxTicksLimit: 10 },
                            grid: { color: border },
                        },
                        y: { title: { display: true, text: "Relative signal (0–1)", color: muted }, ticks: { color: muted }, grid: { color: border }, min: 0, max: 1 },
                    },
                    plugins: {
                        legend: { labels: { color: text } },
                        zoom: { pan: { enabled: false }, zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: "x" } },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    if (todayIdx !== null && items[0]?.dataIndex === todayIdx) {
                                        return `Today — day ${daysSince} since last HIIT`;
                                    }
                                    return items[0]?.label ?? "";
                                },
                            },
                        },
                    },
                },
                plugins: vlinePlugin ? [vlinePlugin] : [],
            } as any);
            return;
        }

        const data = modelDataRef.current;
        if (!data || data.allLabels.length === 0) return;

        const isK1 = view === "k1";
        const coeff = isK1 ? data.k1 : data.k2;
        const tau = isK1 ? data.tau1 : data.tau2;
        const signals = isK1 ? data.allFitnessSignals : data.allFatigueSignals;
        const yLabel = isK1 ? "Fitness component k₁·G(t)" : "Fatigue component k₂·H(t)";
        const dsLabel = isK1
            ? `k₁·G(t)  (k₁=${coeff.toFixed(5)}, τ₁=${tau.toFixed(1)} d)`
            : `k₂·H(t)  (k₂=${coeff.toFixed(5)}, τ₂=${tau.toFixed(1)} d)`;

        const { allLabels: lbs, allDayBuckets: dbs } = data;
        const viewKey = (chartViewRef.current === "day" ? "week" : chartViewRef.current) as "week" | "month" | "year";
        const windowDays = VIEW_WINDOW[viewKey];
        let centerIdx = dbs.findIndex((b) => b === 0);
        if (centerIdx < 0) centerIdx = dbs.findIndex((b) => b >= 0);
        if (centerIdx < 0) centerIdx = lbs.length - 1;
        const halfWindow = Math.floor(windowDays / 2);
        let minIdx = Math.max(0, centerIdx - halfWindow);
        let maxIdx = Math.min(lbs.length - 1, minIdx + windowDays - 1);
        minIdx = Math.max(0, maxIdx - (windowDays - 1));

        chartRef.current = new ChartJS<"line">(ctx, {
            type: "line",
            data: {
                labels: lbs,
                datasets: [{ label: dsLabel, data: signals, borderColor: accentColor, backgroundColor: `rgba(${accentRgb}, 0.12)`, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0, fill: true, spanGaps: true }],
            },
            options: {
                responsive: true,
                layout: { padding: { top: 20 } },
                scales: {
                    x: { title: { display: true, text: "Date", color: muted }, ticks: { color: muted, maxTicksLimit: 11 }, grid: { color: border }, min: lbs[minIdx], max: lbs[maxIdx] },
                    y: { title: { display: true, text: yLabel, color: muted }, ticks: { color: muted }, grid: { color: border } },
                },
                plugins: {
                    legend: { labels: { color: text } },
                    zoom: { pan: { enabled: true, mode: "x" }, zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: "x" } },
                },
            },
        });
    }

    function getAge(birthDateString: string) {
        const today = new Date(); // Current date: June 22, 2026
        const birthDate = new Date(birthDateString);

        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();

        // If the birthday hasn't happened yet this year, subtract 1 from age
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        return age;
    }

    function handleViewChange(view: "week" | "month" | "year") {
        const wasDay = chartViewRef.current === "day";
        setChartView(view);
        chartViewRef.current = view;
        if (wasDay) {
            runCompute(computedInputs);
        } else if (modelChartViewRef.current === "k1" || modelChartViewRef.current === "k2") {
            buildModelChart(modelChartViewRef.current);
        } else {
            applyChartView(view);
        }
    }

    function handleCompute() {
        const nextInputs: HealthInputs = {
            dob,
            sex
        };
        saveHealthInputs(nextInputs);
        runCompute(nextInputs);
        setOnboardingStatusAPI(true);
    }

    function deleteWorkout(id: number) {
        apiFetchWithAuth(`/me/workouts?id=${id}`, { method: "DELETE", headers: authHeader })
            .then(() => loadWorkouts())
            .then((updatedWorkouts) => runCompute(computedInputs, updatedWorkouts))
            .catch((err) => console.error("Failed to delete workout:", err));
    }

    function startEditingWorkout(wo: Workout) {
        setEditingId(wo.id);
        setEditValues({ ...wo });
        setWModalOpen(true);
    }

    function cancelEditingWorkout() {
        setEditingId(null);
        setEditValues({});
        setWModalOpen(false);
        setWError("");
    }

    function formatFutureDateLabel(dayOffset: number): string {
        const roundedOffset = Math.ceil(dayOffset);
        if (roundedOffset <= 0) return "Today";
        const date = new Date();
        date.setDate(date.getDate() + roundedOffset);
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    }

    function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    async function loadWorkouts(): Promise<Workout[]> {
        try {
            const data = await apiFetchWithAuth("/me/workouts", { headers: authHeader });
            const nextWorkouts = Array.isArray(data) ? (data as Workout[]) : [];
            const nextSignature = JSON.stringify(nextWorkouts);
            if (nextSignature === workoutsSignatureRef.current) {
                return nextWorkouts;
            }
            workoutsSignatureRef.current = nextSignature;
            setWorkouts(nextWorkouts);
            workoutsRef.current = nextWorkouts;
            return nextWorkouts;
        } catch (err) {
            setWError(err instanceof Error ? err.message : String(err));
            return [];
        }
    }

    async function addWorkout() {
        setWAdding(true);
        setWError("");
        setWSuccess("");
        try {
            const payload = {
                date: wDate,
                activeCalories: wActiveCalories,
                workoutDuration: wWorkoutDuration,
                avgHeartRate: wAvgHeartRate,
                kilocalories: wKilocalories,
                vo2maxMeasured: wVo2maxMeasured,
                workoutType: wWorkoutType,
                workoutTime: wWorkoutTime,
            };

            await apiFetchWithAuth("/me/workouts", {
                method: "POST",
                headers: authHeader,
                body: JSON.stringify(payload),
            });

            setWSuccess("Workout added!");
            setTimeout(() => setWSuccess(""), 3000);
            setWModalOpen(false);

            setWDate(new Date().toISOString().slice(0, 10));
            setWActiveCalories(450);
            setWWorkoutDuration(60);
            setWAvgHeartRate(145);
            setWKilocalories(520);
            setWVo2maxMeasured(0);
            setWWorkoutType("zone2");
            setWWorkoutTime("");

            const updatedWorkouts = await loadWorkouts();
            runCompute(computedInputs, updatedWorkouts);
        } catch (err) {
            setWError(err instanceof Error ? err.message : String(err));
        } finally {
            setWAdding(false);
        }
    }

    async function saveWorkout(id: number) {
        try {
            const payload = {
                date: editValues.date,
                activeCalories: editValues.activeCalories || 0,
                workoutDuration: editValues.workoutDuration || 0,
                avgHeartRate: editValues.avgHeartRate || 0,
                kilocalories: editValues.kilocalories || 0,
                vo2maxMeasured: editValues.vo2maxMeasured || 0,
                workoutType: editValues.workoutType || "zone2",
                workoutTime: editValues.workoutTime || "",
            };
            await apiFetchWithAuth(`/me/workouts?id=${id}`, {
                method: "PUT",
                headers: authHeader,
                body: JSON.stringify(payload),
            });
            setEditingId(null);
            setEditValues({});
            setWModalOpen(false);
            setWSuccess("Workout updated!");
            setTimeout(() => setWSuccess(""), 3000);
            await loadWorkouts();
            runCompute(computedInputs);
        } catch (err) {
            setWError(err instanceof Error ? err.message : String(err));
        }
    }

    async function loadProfilePicture() {
        try {
            const response = await fetch(`${API}/me/picture`, {
                cache: "no-store",
                headers: authHeader,
            });
            if (response.status === 401) {
                onLogout();
                return;
            }
            if (response.status === 204) {
                if (profilePictureUrl) {
                    URL.revokeObjectURL(profilePictureUrl);
                }
                setProfilePictureUrl(null);
                return;
            }
            if (!response.ok) throw new Error("Failed to load picture");
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            if (profilePictureUrl) {
                URL.revokeObjectURL(profilePictureUrl);
            }
            setProfilePictureUrl(url);
        } catch {
            if (profilePictureUrl) {
                URL.revokeObjectURL(profilePictureUrl);
            }
            setProfilePictureUrl(null);
        }
    }

    async function handlePictureUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setPictureLoading(true);
        try {
            const formData = new FormData();
            formData.append("picture", file);
            const response = await fetch(`${API}/me/picture`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (response.status === 401) {
                onLogout();
                return;
            }

            const responseData = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errorMsg = responseData?.error || `Upload failed with status ${response.status}`;
                throw new Error(errorMsg);
            }

            await loadProfilePicture();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alert("Failed to upload picture: " + errorMessage);
        } finally {
            setPictureLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function loadHealthInputs() {
        try {
            const data = await apiFetchWithAuth("/me/health", { headers: authHeader });
            if (data && typeof data === "object") {
                setVo2max(typeof data.vo2max === "number" ? data.vo2max : 0);
                setHrvBaseline(typeof data.hrvBaseline === "number" ? data.hrvBaseline : 0);
                setRestingHeartRateBaseline(typeof data.restingHeartRateBaseline === "number" ? data.restingHeartRateBaseline : 0);
                setMaxHeartRate(typeof data.maxHeartRate === "number" ? data.maxHeartRate : 0);
                setCardioRecoveryBaseline(typeof data.cardioRecoveryBaseline === "number" ? data.cardioRecoveryBaseline : 0);
                setComputedInputs({
                    dob: typeof data.dob === "number" ? data.dob : 0,
                    sex: typeof data.sex === "string" ? (data.sex === "male" ? "male" : "female") : "male",
                });
            }
            setHasLoadedHealthInputs(true);
        } catch {
            try {
                const saved = localStorage.getItem(INPUTS_STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved) as HealthInputs;
                    const normalized: HealthInputs = {
                        dob: typeof parsed.dob === "string" ? parsed.dob : "",
                        sex: typeof parsed.sex === "string" ? (parsed.sex === "male" ? "male" : "female") : "male",
                    };

                    setDob(normalized.dob);
                    setSex(normalized.sex);
                    setComputedInputs(normalized);
                }
            } catch {
                // malformed local storage is ignored
            }
            setHasLoadedHealthInputs(true);
        }
    }

    async function saveHealthInputs(inputs: HealthInputs) {
        try {
            await apiFetchWithAuth("/me/health", {
                method: "PUT",
                headers: authHeader,
                body: JSON.stringify(inputs),
            });
            try {
                localStorage.setItem(INPUTS_STORAGE_KEY, JSON.stringify(inputs));
            } catch {
                // local storage write failure is ignored
            }
        } catch {
            try {
                localStorage.setItem(INPUTS_STORAGE_KEY, JSON.stringify(inputs));
            } catch {
                // local storage write failure is ignored
            }
        }
    }

    async function runCompute(inputs: HealthInputs, workoutsParam?: Workout[]) {
        setChartLoading(true);
        try {
            const { isLockedOut, resetSeconds, labels, dayBuckets, actualPoints, workoutTypeLabels, peakValue, peakT, nextHiitDay, nextZone2Day, nextZone1Day, phaseBoundaries, modelSignals } = await computeForecastFromAPI(inputs, token, trainingModeRef.current);

            setUserForecast({
                email: "gkounkou@gmail.com",
                peakVo2: peakValue,
                labels: labels,
                values: actualPoints.map(p => p.y),
                nextHiitDay: nextHiitDay,
                nextZone2Day: nextZone2Day,
                nextZone1Day: nextZone1Day,
                error: isLockedOut ? `Rate limit exceeded. Please wait ${resetSeconds} seconds before trying again.` : null,
            });

            chartLabelsRef.current = labels;
            chartDayBucketsRef.current = dayBuckets;
            modelDataRef.current = modelSignals;
            setModelSignalsDisplay(modelSignals);

            setFitnessForecast({
                values: modelDataRef.current?.allFitnessSignals ?? [],
                // labels: modelDataRef.current?.allLabels ?? [],
                k1: modelDataRef.current?.k1 ?? 0,
                tau1: modelDataRef.current?.tau1 ?? 0,
                rmse: modelDataRef.current?.rmse1 ?? 0,
                error: isLockedOut ? `Rate limit exceeded. Please wait ${resetSeconds} seconds before trying again.` : null,
            });

            setFatigueForecast({
                values: modelDataRef.current?.allFatigueSignals ?? [],
                // labels: modelDataRef.current?.allLabels ?? [],
                k2: modelDataRef.current?.k2 ?? 0,
                tau2: modelDataRef.current?.tau2 ?? 0,
                rmse: modelDataRef.current?.rmse2 ?? 0,
                error: isLockedOut ? `Rate limit exceeded. Please wait ${resetSeconds} seconds before trying again.` : null,
            });

            const styles = getComputedStyle(document.documentElement);
            const muted = styles.getPropertyValue("--muted").trim() || "#7c8099";
            const border = styles.getPropertyValue("--border").trim() || "#2a2c38";
            const text = styles.getPropertyValue("--text").trim() || "#e8eaf0";
            const accentColor = styles.getPropertyValue("--accent").trim();
            const accentRgb = styles.getPropertyValue("--accent-rgb").trim();
            const phaseCssColors: Record<string, string> = {
                pre: styles.getPropertyValue("--phase-pre").trim(),
                fatigue: styles.getPropertyValue("--phase-fatigue").trim(),
                recovery: styles.getPropertyValue("--phase-recovery").trim(),
                supercompensation: styles.getPropertyValue("--phase-supercompensation").trim(),
                decay: styles.getPropertyValue("--phase-decay").trim(),
            };
            const hiitLabelColor = styles.getPropertyValue("--hiit-label").trim() || "#ef4444";
            const workoutsToUse = workoutsParam ?? workouts;

            setPeakDay(peakT);
            setPeakVo2(peakValue);

            let ceiledNextHiitDay = Math.ceil(nextHiitDay);
            let ceiledNextZone2Day = Math.ceil(nextZone2Day);

            ceiledNextHiitDay = Math.max(ceiledNextHiitDay, 0);
            ceiledNextZone2Day = Math.max(ceiledNextZone2Day, 0);

            if (ceiledNextHiitDay == ceiledNextZone2Day) {
                ceiledNextZone2Day = null;
            }

            setNextHiitDay(ceiledNextHiitDay);
            setNextZone2Day(ceiledNextZone2Day);
            setNextZone1Day(Math.ceil(nextZone1Day));

            // Day view: build hourly chart from workouts rather than the date-based chart.
            if (chartViewRef.current === "day") {
                buildDayViewChart(dayViewDateRef.current, workoutsToUse);
                return;
            }

            // Model parameter views: show component/decay charts.
            if (modelChartViewRef.current !== "vo2max" && modelChartViewRef.current !== "phases") {
                buildModelChart(modelChartViewRef.current);
                return;
            }

            // ── Compute phase data (used by both phases view and the mini chart) ──
            if (phaseChartRef.current) {
                phaseChartRef.current.destroy();
            }

            // Compute bucket for every HIIT workout (not just those with a chart label).
            const today0 = new Date();
            today0.setHours(0, 0, 0, 0);
            const msPerDay = 24 * 60 * 60 * 1000;
            const allHiitBuckets: number[] = workoutsToUse
                .filter((w) => w.workoutType === "hiit" && w.date)
                .map((w) => {
                    const d = new Date(w.date);
                    d.setHours(0, 0, 0, 0);
                    return Math.round((d.getTime() - today0.getTime()) / msPerDay);
                });

            const fatigueEnd = phaseBoundaries?.fatigueEnd ?? 2;
            const recoveryEnd = phaseBoundaries?.recoveryEnd ?? 7;
            const supercompEnd = phaseBoundaries?.supercompEnd ?? 21;

            const phaseNameForRelativeDay = (relativeDay: number): string => {
                if (relativeDay < 0) return "pre";
                if (relativeDay < fatigueEnd) return "fatigue";
                if (relativeDay < recoveryEnd) return "recovery";
                if (relativeDay < supercompEnd) return "supercompensation";
                return "decay";
            };

            // Priority: fatigue is most dominant, pre is least.
            const PHASE_PRIORITY: Record<string, number> = {
                fatigue: 0, recovery: 1, supercompensation: 2, decay: 3, pre: 4,
            };

            const dominantPhaseAtBucket = (bucket: number): string => {
                if (allHiitBuckets.length === 0) return "pre";
                let best = "pre";
                for (const hb of allHiitBuckets) {
                    const ph = phaseNameForRelativeDay(bucket - hb);
                    if ((PHASE_PRIORITY[ph] ?? 99) < (PHASE_PRIORITY[best] ?? 99)) best = ph;
                }
                return best;
            };

            const buildPhaseSegments = (_visibleMinLabel?: string, _visibleMaxLabel?: string) => {
                const segmentPhases = labels.slice(0, -1).map((_, i) => {
                    const left = dayBuckets[i] ?? 0;
                    const right = dayBuckets[i + 1] ?? left;
                    const midpoint = (left + right) / 2;
                    return dominantPhaseAtBucket(midpoint);
                });

                const phaseColors = segmentPhases.map((phase) => phaseCssColors[phase] || phaseCssColors.decay);

                // Collect all supercomp→decay transition indices (one per HIIT session).
                const supercompToDecayIndices: number[] = segmentPhases.reduce<number[]>((acc, phase, i) => {
                    if (phase === "supercompensation" && segmentPhases[i + 1] === "decay") acc.push(i);
                    return acc;
                }, []);
                const supercompToDecayIdx = supercompToDecayIndices[0] ?? -1;

                return { segmentPhases, phaseColors, supercompToDecayIdx, supercompToDecayIndices };
            };

            const { segmentPhases, phaseColors, supercompToDecayIdx, supercompToDecayIndices } = buildPhaseSegments();

            // Store phase data for buildPhasesChart()
            phaseDataRef.current = {
                labels, dayBuckets, segmentPhases, phaseColors, phaseCssColors,
                fatigueEnd, recoveryEnd, supercompEnd, supercompToDecayIndices,
            };

            // Phases view: render full-size phase chart and stop.
            if (modelChartViewRef.current === "phases") {
                buildPhasesChart();
                return;
            }

            // ── VO2max view ────────────────────────────────────────────────────
            const ctx = canvasRef.current;
            if (!ctx) return;
            if (chartRef.current) chartRef.current.destroy();

            const datasets = [];

            datasets.push({
                label: "Actual VO\u2082max",
                data: actualPoints,
                borderColor: accentColor,
                backgroundColor: `rgba(${accentRgb}, 0.12)`,
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 5,
                showLine: true,
                tension: 0,
                spanGaps: true,
                fill: false,
            });

            const workoutTypeLabelPlugin = {
                id: "workoutTypePointLabels",
                afterDatasetsDraw(chart: any) {
                    const actualMeta = chart.getDatasetMeta(0);
                    if (!actualMeta || actualMeta.hidden) {
                        return;
                    }

                    const chartCtx = chart.ctx;
                    chartCtx.save();
                    chartCtx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
                    chartCtx.fillStyle = muted;
                    chartCtx.textAlign = "center";
                    chartCtx.textBaseline = "bottom";

                    actualMeta.data.forEach((pointEl: any, index: number) => {
                        const rawPoint = actualPoints[index];
                        const labelIdx = rawPoint && typeof rawPoint.x === "number" ? rawPoint.x : -1;
                        const label = labelIdx >= 0 ? workoutTypeLabels[labelIdx] : "";
                        if (!label) {
                            return;
                        }
                        chartCtx.fillStyle = label.includes("HIIT") ? hiitLabelColor : muted;
                        const point = pointEl.getProps(["x", "y"], true);
                        chartCtx.fillText(label, point.x, point.y - 8);
                    });

                    chartCtx.restore();
                },
            };

            let maxVo2 = 0;
            actualPoints.forEach((p) => {
                if (p && Number.isFinite(p.y)) {
                    maxVo2 = Math.max(maxVo2, p.y);
                }
            });
            const yAxisMax = maxVo2 > 0 ? maxVo2 + 0.1 : 60;

            const WINDOW_DAYS = VIEW_WINDOW[chartViewRef.current];
            const computeInitialWindowLabels = () => {
                if (labels.length === 0) {
                    return { minLabel: undefined as string | undefined, maxLabel: undefined as string | undefined };
                }

                let centerIdx = dayBuckets.findIndex((b) => b === 0);
                if (centerIdx < 0) {
                    centerIdx = dayBuckets.findIndex((b) => b >= 0);
                }
                if (centerIdx < 0) {
                    centerIdx = labels.length - 1;
                }

                const halfWindow = Math.floor(WINDOW_DAYS / 2);
                let minIdx = Math.max(0, centerIdx - halfWindow);
                let maxIdx = Math.min(labels.length - 1, minIdx + WINDOW_DAYS - 1);
                minIdx = Math.max(0, maxIdx - (WINDOW_DAYS - 1));

                return {
                    minLabel: labels[minIdx],
                    maxLabel: labels[maxIdx],
                };
            };

            const { minLabel: initialWindowMinLabel, maxLabel: initialWindowMaxLabel } = computeInitialWindowLabels();

            chartRef.current = new ChartJS<"line">(ctx, {
                type: "line",
                data: {
                    labels,
                    datasets,
                },
                plugins: [workoutTypeLabelPlugin],
                options: {
                    responsive: true,
                    layout: {
                        padding: { top: 20 },
                    },
                    scales: {
                        x: {
                            title: { display: true, text: "Date", color: muted },
                            ticks: { maxTicksLimit: 11, color: muted },
                            grid: { color: border },
                            min: initialWindowMinLabel,
                            max: initialWindowMaxLabel,
                        },
                        y: {
                            title: { display: true, text: "VO\u2082max (mL/kg/min)", color: muted },
                            ticks: { color: muted },
                            grid: { color: border },
                            max: yAxisMax,
                        },
                    },
                    plugins: {
                        legend: { labels: { color: text } },
                        zoom: {
                            pan: { enabled: true, mode: "x" },
                            zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: "x" },
                        },
                    },
                },
            });

            if (isLockedOut) {
                setIsRateLimited(true);
                setRateLimitSeconds(resetSeconds);
            } else {
                setIsRateLimited(false);
                setRateLimitSeconds(null);
            }

        } catch (err) {
            console.error("Forecast computation failed:", err);
            setPeakDay(null);
            setPeakVo2(null);

            const errorMessage = err instanceof Error ? err.message : String(err);

            // Check if the server responded with a 429 status code
            if (errorMessage.includes("Forecast API failed with status 429")) {
                setIsRateLimited(true);

                // Start with 300 seconds (5 minutes) as a fallback
                const secondsToWait = 300;

                setRateLimitSeconds(secondsToWait);
            }
        } finally {
            setChartLoading(false);
        }
    }

    async function getOnboardingStatus() {
        try {
            const data = await apiFetchWithAuth("/me/onboarding", { headers: authHeader });
            if (data && typeof data === "object") {
                setIsOnboardingComplete(Boolean(data.completed));
            }
        } catch {
            console.log("Failed to fetch onboarding status");
            setIsOnboardingComplete(false);
        }
    }

    async function setOnboardingStatusAPI(status: boolean) {
        try {
            await apiFetchWithAuth("/me/onboarding", {
                method: "PUT",
                headers: authHeader,
                body: JSON.stringify({ completed: status }),
            });
            setIsOnboardingComplete(status);
        } catch {
            // Ignore errors
            console.log("Failed to set onboarding status");
            setIsOnboardingComplete(false);
        }
    }

    useEffect(() => {
        return () => {
            chartRef.current?.destroy();
        };
    }, []);

    useEffect(() => {
        const refreshWorkouts = async () => {
            if (editingId !== null || wAdding || document.visibilityState !== "visible") {
                return;
            }
            const prevSig = workoutsSignatureRef.current;
            const updated = await loadWorkouts();
            if (workoutsSignatureRef.current !== prevSig) {
                runCompute(computedInputsRef.current, updated);
            }
        };

        const onWindowFocus = () => {
            refreshWorkouts();
        };

        const onVisibilityChange = () => {
            refreshWorkouts();
        };

        const intervalId = window.setInterval(refreshWorkouts, WORKOUTS_AUTO_REFRESH_MS);
        window.addEventListener("focus", onWindowFocus);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", onWindowFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [token, editingId, wAdding]);

    useEffect(() => {
        let isCancelled = false;
        const previousToken = previousTokenRef.current;
        const isUserSwitch = previousToken !== null && previousToken !== token;
        previousTokenRef.current = token;
        setDashboardReady(false);

        if (isUserSwitch) {
            if (profilePictureUrl) {
                URL.revokeObjectURL(profilePictureUrl);
            }
            setProfilePictureUrl(null);
            workoutsSignatureRef.current = "";
            setWorkouts([]);
            setVo2max(0);
            setHrvBaseline(0);
            setRestingHeartRateBaseline(0);
            setMaxHeartRate(0);
            setCardioRecoveryBaseline(0);
            setHasLoadedHealthInputs(false);
        }

        Promise.allSettled([
            loadWorkouts(),
            loadProfilePicture(),
            loadHealthInputs(),
        ]).finally(() => {
            if (!isCancelled) {
                setDashboardReady(true);
            }
        });

        return () => {
            isCancelled = true;
            if (profilePictureUrl) {
                URL.revokeObjectURL(profilePictureUrl);
            }
        };
    }, [token]);

    useEffect(() => {
        if (!dashboardReady || !hasLoadedHealthInputs || vo2max === 0) {
            return;
        }
        runCompute(computedInputs);
    }, [dashboardReady, hasLoadedHealthInputs, computedInputs, theme, accent, token]);

    useEffect(() => {
        localStorage.setItem("vo2max-dob", String(dob));
        localStorage.setItem("vo2max-sex", sex);
    }, [dob, sex]);

    useEffect(() => {
        if (rateLimitSeconds === null) return;

        if (rateLimitSeconds <= 0) {
            setIsRateLimited(false);
            setRateLimitSeconds(null);
            return;
        }

        // Tick down by 1 second
        const timer = setTimeout(() => {
            setRateLimitSeconds(rateLimitSeconds - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [rateLimitSeconds]);

    useEffect(() => {
        // 2. Call your async function inside the effect
        getOnboardingStatus()
            .then(() => {
                setCanDisplayOnboardingPopup(true);
                runCompute(computedInputs);
            })
            .catch(() => {
                // Default to showing the popup if the API check fails
                console.log("Failed to fetch onboarding status");
                setCanDisplayOnboardingPopup(true);
            })
            .finally(() => {
            });
    }, []); // Empty dependency array ensures this runs exactly once on mount


    // return (
    //     <div className="card animate-in dashboard">
    //         <div className="dash-header">
    //             <div className="dash-title">
    //                 <ThemeControls
    //                     theme={theme}
    //                     accent={accent}
    //                     onThemeChange={onThemeChange}
    //                     onAccentChange={onAccentChange}
    //                     onLogout={onLogout}
    //                     onChangePassword={() => {
    //                         setPwCurrent("");
    //                         setPwNew("");
    //                         setPwConfirm("");
    //                         setPwError("");
    //                         setPwSuccess("");
    //                         setPwModalOpen(true);
    //                     }}
    //                 />
    //                 {/* <span className="logo-mark dash-logo"></span> */}
    //                 <h1>Cardio Fitness</h1>
    //                 <div className="training-mode-toggle">
    //                     {(["Wellness", "Maintenance", "Athletic Building"] as const).map((m) => (
    //                         <button
    //                             key={m}
    //                             className={`training-mode-btn${trainingMode === m ? " active" : ""}`}
    //                             onClick={() => {
    //                                 if (isRateLimited) return;

    //                                 setTrainingMode(m);
    //                                 trainingModeRef.current = m;
    //                                 runCompute(computedInputs);
    //                             }}
    //                         >
    //                             {m === "Maintenance" ? "Maintenance" : m === "Athletic Building" ? "Athletic" : "Wellness"}
    //                         </button>
    //                     ))}
    //                 </div>
    //                 {/* <button className="btn-secondary dash-metrics-btn" onClick={() => setMetricsModalOpen(true)}>
    //                     Baseline Metrics
    //                 </button> */}
    //             </div>
    //             <div className="profile-section">
    //                 <div className="profile-column">
    //                     <div className="profile-avatar" onClick={() => fileInputRef.current?.click()} title="Click to change picture">
    //                         {profilePictureUrl ? (
    //                             <img src={profilePictureUrl} alt="Profile" />
    //                         ) : (
    //                             <span className="profile-avatar__placeholder">👤</span>
    //                         )}
    //                     </div>
    //                     <input
    //                         ref={fileInputRef}
    //                         type="file"
    //                         accept="image/*"
    //                         onChange={handlePictureUpload}
    //                         disabled={pictureLoading}
    //                         hidden
    //                     />
    //                     <span className="profile-email">
    //                         {pictureLoading ? "Uploading..." : ""}  { /* {email} */}
    //                     </span>
    //                 </div>
    //             </div>
    //         </div>

    //         <div className="dash-body">
    //             <div className={`dash-chart${chartView === "day" ? " day-view" : ""}`}>
    //                 <div className="model-view-picker">
    //                     {([
    //                         { key: "vo2max", label: "VO₂max" },
    //                         { key: "phases", label: "Phases" },
    //                         { key: "k1", label: "Fitness k₁" },
    //                         { key: "k2", label: "Fatigue k₂" },
    //                         { key: "tau1", label: "τ₁ Fitness Decay" },
    //                         { key: "tau2", label: "τ₂ Fatigue Decay" },
    //                     ] as const).map(({ key, label }) => (
    //                         <button
    //                             key={key}
    //                             className={`chart-view-btn${modelChartView === key ? " active" : ""}`}
    //                             onClick={() => {

    //                                 if (modelChartView === key || isRateLimited) {
    //                                     return;
    //                                 }
    //                                 setModelChartView(key);
    //                                 modelChartViewRef.current = key;
    //                                 if (key === "vo2max") {
    //                                     runCompute(computedInputs);
    //                                 } else if (key === "phases") {
    //                                     runCompute(computedInputs);
    //                                     buildPhasesChart();
    //                                 } else {
    //                                     buildModelChart(key);
    //                                 }
    //                             }}
    //                         >
    //                             {label}
    //                         </button>
    //                     ))}
    //                 </div>
    //                 {chartView === "day" && (
    //                     <div className="day-view-nav">
    //                         <button className="day-view-nav-btn" onClick={() => navigateDayView(-1)}>&#8249;</button>
    //                         <span className="day-view-nav-date">{(() => { const [yr, mo, dy] = dayViewDate.split("-").map(Number); return new Date(yr, mo - 1, dy).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); })()}</span>
    //                         <button className="day-view-nav-btn" onClick={() => navigateDayView(1)} disabled={dayViewDate >= new Date().toISOString().slice(0, 10)}>&#8250;</button>
    //                     </div>
    //                 )}
    //                 {chartLoading && (
    //                     <div className="chart-splash">
    //                         <span className="spinner large" />
    //                         <span className="chart-splash-label">Loading data...</span>
    //                     </div>
    //                 )}

    //                 {/* 🌟 Floating Notice Banner */}
    //                 {isRateLimited && rateLimitSeconds !== null && (
    //                     <div className="rate-limit-banner">
    //                         <div className="banner-content">
    //                             <span className="banner-icon">⏳</span>
    //                             <span className="banner-text">
    //                                 <strong>Forecast updated!</strong> To keep things running smoothly, future requests are locked for the next <strong>{formatTime(rateLimitSeconds)}</strong>.
    //                             </span>
    //                         </div>
    //                     </div>
    //                 )}

    //                 <canvas ref={canvasRef} className={`dash-main-chart${chartLoading ? " is-loading" : ""}`} />

    //                 {modelChartView === "phases" && (
    //                     <div className="phase-legend" aria-hidden={chartLoading ? "true" : "false"}>
    //                         {PHASE_ORDER.filter(k => k !== "pre").map((phaseKey) => (
    //                             <div key={phaseKey} className="phase-legend-item">
    //                                 <span className={`phase-swatch phase-swatch--${phaseKey}`} />
    //                                 <span className="phase-legend-label">{PHASE_LABELS[phaseKey]}</span>
    //                             </div>
    //                         ))}
    //                     </div>
    //                 )}
    //                 {modelChartView === "vo2max" && (chartLoading ? (
    //                     <div className="chart-stats" aria-live="polite" aria-busy="true">
    //                         {/* <div className="chart-stats-item"><span>Peak Day</span><strong className="dash-results-skeleton" aria-hidden="true" /></div> */}
    //                         {/* <div className="chart-stats-item"><span>Peak VO₂max</span><strong className="dash-results-skeleton" aria-hidden="true" /></div> */}
    //                         <div className="chart-stats-item"><span>Next Training</span><strong className="dash-results-skeleton" aria-hidden="true" /></div>
    //                     </div>
    //                 ) : peakDateLabel !== null && peakVo2 !== null ? (
    //                     <div className="chart-stats">
    //                         {([
    //                             { day: nextHiitDayState, label: "HIIT", dateLabel: nextHiitDateLabel },
    //                             { day: nextZone2DayState, label: "Run", dateLabel: nextZone2DateLabel },
    //                             { day: nextZone1DayState, label: "Walk", dateLabel: nextZone1DateLabel },
    //                         ] as const)
    //                             .filter(item => item.day !== null && item.dateLabel !== null)
    //                             .sort((a, b) => (a.day as number) - (b.day as number))
    //                             .map(item => {
    //                                 const isToday = (item.day as number) <= 0;
    //                                 return (
    //                                     <div key={item.label} className="chart-stats-item">
    //                                         <span>{isToday ? `Upcoming ${item.label}` : `Next ${item.label}`}</span>
    //                                         <strong>{item.dateLabel}</strong>
    //                                     </div>
    //                                 );
    //                             })
    //                         }
    //                     </div>
    //                 ) : null)}
    //                 <div className="chart-view-picker">
    //                     {(["week", "month", "year"] as const).map((v) => (
    //                         <button
    //                             key={v}
    //                             className={`chart-view-btn${chartView === v ? " active" : ""}${modelChartView === "tau1" || modelChartView === "tau2" ? " disabled" : ""}`}
    //                             onClick={() => handleViewChange(v)}
    //                             disabled={modelChartView === "tau1" || modelChartView === "tau2"}
    //                         >
    //                             {v.charAt(0).toUpperCase() + v.slice(1)}
    //                         </button>
    //                     ))}
    //                 </div>
    //                 {/* <p className="dash-hint">Drag to pan</p> */}
    //             </div>

    //             {modelSignalsDisplay && (
    //                 <div className="workout-structure-recommendation">
    //                     <button
    //                         className="workout-structure-recommendation-toggle"
    //                         onClick={() => setWorkoutStructureRecommendationOpen(o => !o)}
    //                         aria-expanded={workoutStructureRecommendationOpen}
    //                     >
    //                         <h2 className="workout-structure-recommendation-title">Workout Structure recommendation</h2>
    //                         <span className={`metrics-chevron${workoutStructureRecommendationOpen ? " open" : ""}`}>▾</span>
    //                     </button>
    //                     {workoutStructureRecommendationOpen && (
    //                         <dl className="metrics-list">
    //                             <div className="metrics-item">
    //                                 <dt><strong>Tailored High Intensity Interval Training (HIIT) Protocol </strong></dt>
    //                                 <dd>
    //                                     {`Norwegian 4×4 protocol adapted to your parameters. The Norwegian 4×4 protocol is a world-famous interval workout designed by medical researchers to rapidly boost your cardio fitness. The format is simple: you do four minutes of hard effort followed by three minutes of easy recovery, repeated four times.By adapting this protocol directly to your personal parameters like your unique fitness level, and fatigue level, we customize the exact intensity you need for maximum results.`}
    //                                     {(() => {
    //                                         const s = generateDynamicHIITSegments({
    //                                             dob,
    //                                             sex,
    //                                             vo2max: latestActualVo2max,
    //                                             k1: modelSignalsDisplay.k1,
    //                                             tau1: modelSignalsDisplay.tau1,
    //                                             k2: modelSignalsDisplay.k2,
    //                                             tau2: modelSignalsDisplay.tau2,
    //                                         });

    //                                         return (
    //                                             <div className="hiit-bar-wrapper" style={{ width: '100%', marginTop: '1rem' }}>
    //                                                 {/* Calculate total time to properly scale widths down to a 0-100% boundary limit */}
    //                                                 {(() => {
    //                                                     const totalSeconds = s.reduce((sum, seg) => sum + seg.durationSeconds, 0);

    //                                                     return (
    //                                                         <>
    //                                                             {/* Colored Visual Blocks Track */}
    //                                                             {/* Colored Track with Time Text Inside */}
    //                                                             <div className="hiit-bar" style={{ display: 'flex', width: '100%', overflow: 'hidden', borderRadius: '16px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
    //                                                                 {s.map((seg, idx) => {
    //                                                                     const isWork = seg.segment.includes("Zone 5");
    //                                                                     const isRest = seg.segment.startsWith("Rest");
    //                                                                     const blockWidth = (seg.durationSeconds / totalSeconds) * 100;
    //                                                                     const bandClass = isWork ? "hiit-band--zone-5" : isRest ? "hiit-band--recovery" : seg.segment.toLowerCase() === "warmup" ? "hiit-band--warmup" : "hiit-band--cooldown";

    //                                                                     return (
    //                                                                         <div
    //                                                                             key={idx}
    //                                                                             className={`hiit-band ${bandClass}`}
    //                                                                             style={{
    //                                                                                 width: `${blockWidth}%`,
    //                                                                                 height: '100%',
    //                                                                                 display: 'flex',
    //                                                                                 alignItems: 'center',
    //                                                                                 justifyContent: 'center',
    //                                                                                 position: 'relative',
    //                                                                                 overflow: 'hidden', // Keeps text contained
    //                                                                                 color: '#1f2937', // Dark readable text color
    //                                                                                 fontSize: '11px',
    //                                                                                 fontWeight: 'bold',
    //                                                                                 textShadow: '1px 1px 1px rgba(255,255,255,0.4)' // Sharp font contrast overlay
    //                                                                             }}
    //                                                                             title={`${seg.segment}: ${Math.round(seg.durationSeconds / 60)} min`}
    //                                                                         >
    //                                                                             {/* Render the minute value right here inside the color track */}
    //                                                                             <span style={{ whiteSpace: 'nowrap', padding: '0 2px' }}>
    //                                                                                 {Math.round(seg.durationSeconds / 60)}m
    //                                                                             </span>
    //                                                                         </div>
    //                                                                     );
    //                                                                 })}
    //                                                             </div>

    //                                                             {/* Clean Horizontal Aligned Label Rows */}
    //                                                             <div className="hiit-bar-labels" style={{ display: 'flex', width: '100%', marginTop: '6px', fontSize: '11px', textAlign: 'center' }}>
    //                                                                 {s.map((seg, idx) => {
    //                                                                     const blockWidth = (seg.durationSeconds / totalSeconds) * 100;

    //                                                                     return (
    //                                                                         <span
    //                                                                             key={idx}
    //                                                                             style={{
    //                                                                                 width: `${blockWidth}%`,
    //                                                                                 display: 'block',
    //                                                                                 whiteSpace: 'nowrap',
    //                                                                                 overflow: 'hidden',
    //                                                                                 textOverflow: 'ellipsis',
    //                                                                                 padding: '0 2px'
    //                                                                             }}
    //                                                                         >
    //                                                                             {seg.segment}
    //                                                                         </span>
    //                                                                     );
    //                                                                 })}
    //                                                             </div>
    //                                                         </>
    //                                                     );
    //                                                 })()}
    //                                             </div>
    //                                         );

    //                                     })()}
    //                                 </dd>
    //                             </div>
    //                             <div className="metrics-item">
    //                                 <dt><strong>Tailored run Protocol - minimum {zone2Duration.toFixed(0)} minutes</strong></dt>
    //                                 <dd>
    //                                     {(() => {
    //                                         const zone2Duration = calculateZone2Duration({
    //                                             k1: modelSignalsDisplay.k1,
    //                                             k2: modelSignalsDisplay.k2,
    //                                             tau1: modelSignalsDisplay.tau1,
    //                                             tau2: modelSignalsDisplay.tau2
    //                                         });

    //                                         return <>Based on your parameters, we recommend at least <strong>{zone2Duration.toFixed(0)}</strong> minutes based on scheduled recommendation of running or similar moderate activity. Zone 2 workouts require a moderate, steady effort like a light jog or a brisk power walk. You can still talk, but you can only manage short sentences before needing a breath.</>;
    //                                     })()}
    //                                 </dd>
    //                             </div>
    //                             <div className="metrics-item">
    //                                 <dt><strong>Tailored walk Protocol - minimum {zone1Duration.toFixed(0)} minutes</strong></dt>
    //                                 <dd>
    //                                     {(() => {
    //                                         const zone1Duration = calculateZone1Duration({
    //                                             k1: modelSignalsDisplay.k1,
    //                                             k2: modelSignalsDisplay.k2,
    //                                             tau1: modelSignalsDisplay.tau1,
    //                                             tau2: modelSignalsDisplay.tau2
    //                                         });
    //                                         return <>Based on your parameters, we recommend at least <strong>{zone1Duration.toFixed(0)}</strong> minutes based on scheduled recommendation of walking or similar light activity. Zone 1 workouts are very light, comfortable activities like a casual walk or an easy bike ride. In this zone, you can easily carry on a full conversation without catching your breath.</>;
    //                                     })()}
    //                                 </dd>
    //                             </div>
    //                         </dl>
    //                     )}
    //                 </div>
    //             )}

    //             {modelSignalsDisplay && (
    //                 <div className="metrics-explainer">
    //                     <button
    //                         className="metrics-explainer-toggle"
    //                         onClick={() => setMetricsOpen(o => !o)}
    //                         aria-expanded={metricsOpen}
    //                     >
    //                         <h2 className="metrics-explainer-title">Metrics Explained</h2>
    //                         <span className={`metrics-chevron${metricsOpen ? " open" : ""}`}>▾</span>
    //                     </button>
    //                     {metricsOpen && (
    //                         <dl className="metrics-list">
    //                             <div className="metrics-item">
    //                                 <dt><strong>VO₂max = {latestActualVo2max.toFixed(2)} mL/kg/min — {classifyVo2max(latestActualVo2max, getAge(dob), sex)}</strong></dt>
    //                                 <dd>
    //                                     {classifyVo2max(latestActualVo2max, getAge(dob), sex) === "High"
    //                                         ? `Good fitnes is associated with better health and performance. Poor fitness increases the risk of becoming ill and health risks like cardiovascular disease. Cardio fitness or VO₂max can reveal information about your long-term lifestyle. Even a small improvmement in fitness produces significant health benefits. Based on your data, you have an excellent cardiovascular fitness for your age and sex. Your body delivers and uses oxygen very effectively during intense exercise.`
    //                                         : classifyVo2max(latestActualVo2max, getAge(dob), sex) === "Above Average"
    //                                             ? `Good fitnes is associated with better health and performance. Poor fitness increases the risk of becoming ill and health risks like cardiovascular disease. Cardio fitness or VO₂max can reveal information about your long-term lifestyle. Even a small improvmement in fitness produces significant health benefits. Based on your data, you have a solid aerobic base for your age and sex. You can sustain effort well and have a good foundation for endurance performance.`
    //                                             : classifyVo2max(latestActualVo2max, getAge(dob), sex) === "Below Average"
    //                                                 ? `Good fitnes is associated with better health and performance. Poor fitness increases the risk of becoming ill and health risks like cardiovascular disease. Cardio fitness or VO₂max can reveal information about your long-term lifestyle. Even a small improvmement in fitness produces significant health benefits. Based on your data, there is meaningful room to improve. Consistent Zone 2 and HIIT training will raise your VO₂max over the coming months.`
    //                                                 : `Low aerobic capacity for your age and sex. Prioritising regular aerobic exercise, even at moderate intensity, will produce noticeable gains.`}
    //                                     {(() => {
    //                                         const t = getVo2maxThresholds(getAge(dob), sex);
    //                                         const highBandW = t.aboveAvgMax - t.belowAvgMax;
    //                                         const barMin = Math.max(0, t.lowMax - highBandW);
    //                                         const barMax = t.aboveAvgMax + highBandW * 1.5;
    //                                         const range = barMax - barMin;
    //                                         const lowPct = ((t.lowMax - barMin) / range) * 100;
    //                                         const belowPct = ((t.belowAvgMax - t.lowMax) / range) * 100;
    //                                         const abovePct = ((t.aboveAvgMax - t.belowAvgMax) / range) * 100;
    //                                         const highPct = 100 - lowPct - belowPct - abovePct;
    //                                         const markerPct = Math.max(0, Math.min(100, ((latestActualVo2max - barMin) / range) * 100));
    //                                         return (
    //                                             <div className="vo2max-bar-wrapper">
    //                                                 <div className="vo2max-bar">
    //                                                     <div className="vo2max-band vo2max-band--low" style={{ width: `${lowPct}%` }} />
    //                                                     <div className="vo2max-band vo2max-band--below" style={{ width: `${belowPct}%` }} />
    //                                                     <div className="vo2max-band vo2max-band--above" style={{ width: `${abovePct}%` }} />
    //                                                     <div className="vo2max-band vo2max-band--high" style={{ width: `${highPct}%` }} />
    //                                                     <div className="vo2max-marker" style={{ left: `${markerPct}%` }} />
    //                                                 </div>
    //                                                 <div className="vo2max-bar-labels">
    //                                                     <span style={{ width: `${lowPct}%` }}>Low</span>
    //                                                     <span style={{ width: `${belowPct}%` }}>Below Avg</span>
    //                                                     <span style={{ width: `${abovePct}%` }}>Above Avg</span>
    //                                                     <span style={{ width: `${highPct}%` }}>High</span>
    //                                                 </div>
    //                                                 <div className="vo2max-bar-ranges">
    //                                                     <span style={{ width: `${lowPct}%` }}>≤{t.lowMax}</span>
    //                                                     <span style={{ width: `${belowPct}%` }}>{t.lowMax + 1}–{t.belowAvgMax}</span>
    //                                                     <span style={{ width: `${abovePct}%` }}>{t.belowAvgMax + 1}–{t.aboveAvgMax}</span>
    //                                                     <span style={{ width: `${highPct}%` }}>&gt;{t.aboveAvgMax}</span>
    //                                                 </div>
    //                                             </div>
    //                                         );
    //                                     })()}
    //                                 </dd>
    //                             </div>
    //                             <div className="metrics-item">
    //                                 <dt><strong>τ₁ (Fitness Decay) = {modelSignalsDisplay.tau1.toFixed(2)}</strong></dt>
    //                                 <dd>This is how long your fitness lasts. A value of {modelSignalsDisplay.tau1.toFixed(0)} means it takes about {(modelSignalsDisplay.tau1 * Math.LN2).toFixed(0)} days for your hard-earned fitness to drop by half if you stop training. In sports science, fitness is temporary. While your body builds endurance from hard workouts, that extra stamina slowly fades away during rest periods or breaks. By calculating your unique τ₁ time constant, our app predicts exactly how fast your fitness drops over days of inactivity.</dd>
    //                             </div>
    //                             <div className="metrics-item">
    //                                 <dt><strong>k₁ (Fitness Gain) = {modelSignalsDisplay.k1.toFixed(6)}</strong></dt>
    //                                 <dd>This shows how much fitness you gain from a single workout. It is a small number because you cannot get super fit from just one session. In sports science, every training session acts as a positive stimulus for your body. The k₁ constant calculates your unique training sensitivity. It tells the app exactly how much fitness value your heart and muscles gain from the effort you put in.</dd>
    //                             </div>
    //                             <div className="metrics-item">
    //                                 <dt><strong>τ₂ (Fatigue Decay) = {modelSignalsDisplay.tau2.toFixed(2)}</strong></dt>
    //                                 <dd>This is how fast you recover. A value of {modelSignalsDisplay.tau2.toFixed(0)} means your tiredness drops by half in just {(modelSignalsDisplay.tau2 * Math.LN2).toFixed(0)} days. Notice this is much shorter than the fitness number ({modelSignalsDisplay.tau1.toFixed(0)}), which is normal — fatigue goes away faster than fitness. When you exercise, you gain both fitness and fatigue. While fitness stays with you for a long time, fatigue usually fades away much faster. By calculating your unique τ₂ time constant, our app tracks how quickly your muscles and nervous system bounce back so you know when you are truly ready to perform again.</dd>
    //                             </div>
    //                             <div className="metrics-item">
    //                                 <dt><strong>k₂ (Fatigue Gain) = {modelSignalsDisplay.k2.toFixed(6)}</strong></dt>
    //                                 <dd>This shows how much tireder you get from a single workout. This number is bigger than the fitness gain (k₁) because a hard workout makes you very tired right away, even if the fitness benefits take time to show up. Every time you train, you build both fitness and fatigue. The k₂ constant calculates your unique sensitivity to exercise stress. It tells the app exactly how heavy of a physical toll a specific session takes on your heart, muscles, and nervous system.</dd>
    //                             </div>
    //                             {(modelSignalsDisplay.rmse1 > 0 || modelSignalsDisplay.rmse2 > 0) && (
    //                                 <div className="metrics-item">
    //                                     <dt><strong>RMSE = {modelSignalsDisplay.rmse1.toFixed(4)} (fitness) &amp; {modelSignalsDisplay.rmse2.toFixed(4)} (fatigue)</strong></dt>
    //                                     <dd>Root Mean Square Error tells you how accurately the model matches your real VO₂max measurements. A lower number means the math fits your data more closely.</dd>
    //                                 </div>
    //                             )}
    //                         </dl>
    //                     )}
    //                 </div>
    //             )}
    //         </div>

    //         <div className="workout-log">
    //             <div className="workout-log-header">
    //                 <h2 className="workout-log-title">Workout Log</h2>
    //                 <button
    //                     className="btn-primary workout-add-trigger"
    //                     onClick={() => { setEditingId(null); setWError(""); setWModalOpen(true); }}
    //                 >
    //                     + Add Workout
    //                 </button>
    //             </div>

    //             {wSuccess && <div className="alert alert-success">{wSuccess}</div>}

    //             {displayedWorkouts.length > 0 ? (
    //                 <table className="workout-table">
    //                     <thead>
    //                         <tr>
    //                             <th>Date</th>
    //                             <th>Type</th>
    //                             <th>Duration</th>
    //                             <th>Active cal</th>
    //                             <th>Total kcal</th>
    //                             <th>Avg HR</th>
    //                             <th>VO₂max</th>
    //                             <th></th>
    //                         </tr>
    //                     </thead>
    //                     <tbody>
    //                         {displayedWorkouts.map(wo => (
    //                             <tr key={wo.id}>
    //                                 <td>{wo.date}</td>
    //                                 <td><span className={`type-badge type-${wo.workoutType || "zone2"}`}>{wo.workoutType === "hiit" ? "HIIT" : wo.workoutType === "zone1" ? "Walk" : "Run"}</span></td>
    //                                 <td>{wo.workoutDuration.toFixed(0)} min</td>
    //                                 <td>{wo.activeCalories.toFixed(0)} kcal</td>
    //                                 <td>{wo.kilocalories.toFixed(0)} kcal</td>
    //                                 <td>{wo.avgHeartRate.toFixed(0)} bpm</td>
    //                                 <td>{wo.vo2maxMeasured.toFixed(2)}</td>
    //                                 <td>
    //                                     <button className="workout-del-btn" onClick={() => startEditingWorkout(wo)}>✎</button>
    //                                     <button className="workout-del-btn" onClick={() => deleteWorkout(wo.id)}>✕</button>
    //                                 </td>
    //                             </tr>
    //                         ))}
    //                     </tbody>
    //                 </table>
    //             ) : (
    //                 <p className="dash-hint dash-hint--empty">No workouts logged yet.</p>
    //             )}
    //         </div>

    //         {
    //             wModalOpen && (
    //                 <div className="workout-modal-overlay" onClick={cancelEditingWorkout}>
    //                     <div className="workout-modal animate-in" onClick={e => e.stopPropagation()}>
    //                         <div className="workout-modal-header">
    //                             <h3>{editingId !== null ? "Edit Workout" : "Add Workout"}</h3>
    //                             <button className="workout-modal-close" onClick={cancelEditingWorkout} aria-label="Close">✕</button>
    //                         </div>
    //                         <div className="workout-modal-body">
    //                             {editingId !== null ? (
    //                                 <>
    //                                     <label className="dash-field">
    //                                         <span>Date</span>
    //                                         <input className="plain-input" type="date" value={editValues.date || ""} onChange={e => setEditValues({ ...editValues, date: e.target.value })} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Time (optional)</span>
    //                                         <input className="plain-input" type="time" value={editValues.workoutTime || ""} onChange={e => setEditValues({ ...editValues, workoutTime: e.target.value })} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Type</span>
    //                                         <select className="plain-input" value={editValues.workoutType || "zone2"} onChange={e => setEditValues({ ...editValues, workoutType: e.target.value })}>
    //                                             <option value="zone1">Zone 1</option>
    //                                             <option value="zone2">Zone 2</option>
    //                                             <option value="hiit">HIIT</option>
    //                                         </select>
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Duration (min)</span>
    //                                         <input className="plain-input" type="number" value={editValues.workoutDuration || ""} step={1} onChange={e => setEditValues({ ...editValues, workoutDuration: parseFloat(e.target.value) || 0 })} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Active Calories</span>
    //                                         <input className="plain-input" type="number" value={editValues.activeCalories || ""} step={1} onChange={e => setEditValues({ ...editValues, activeCalories: parseFloat(e.target.value) || 0 })} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Total Kilocalories</span>
    //                                         <input className="plain-input" type="number" value={editValues.kilocalories || ""} step={1} onChange={e => setEditValues({ ...editValues, kilocalories: parseFloat(e.target.value) || 0 })} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Avg Heart Rate</span>
    //                                         <input className="plain-input" type="number" value={editValues.avgHeartRate || ""} step={1} onChange={e => setEditValues({ ...editValues, avgHeartRate: parseFloat(e.target.value) || 0 })} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>VO₂max Measured</span>
    //                                         <input className="plain-input" type="number" value={editValues.vo2maxMeasured || ""} step={0.1} onChange={e => setEditValues({ ...editValues, vo2maxMeasured: parseFloat(e.target.value) || 0 })} />
    //                                     </label>
    //                                 </>
    //                             ) : (
    //                                 <>
    //                                     <label className="dash-field">
    //                                         <span>Date</span>
    //                                         <input className="plain-input" type="date" value={wDate} onChange={e => setWDate(e.target.value)} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Time (optional)</span>
    //                                         <input className="plain-input" type="time" value={wWorkoutTime} onChange={e => setWWorkoutTime(e.target.value)} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Type</span>
    //                                         <select className="plain-input" value={wWorkoutType} onChange={e => setWWorkoutType(e.target.value)}>
    //                                             <option value="zone1">Zone 1</option>
    //                                             <option value="zone2">Zone 2</option>
    //                                             <option value="hiit">HIIT</option>
    //                                         </select>
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Duration (min)</span>
    //                                         <input className="plain-input" type="number" placeholder="e.g. 60" value={wWorkoutDuration || ""} step={1} min={0} onChange={e => setWWorkoutDuration(isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Active Calories</span>
    //                                         <input className="plain-input" type="number" placeholder="e.g. 450" value={wActiveCalories || ""} step={1} min={0} onChange={e => setWActiveCalories(isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Total Kilocalories</span>
    //                                         <input className="plain-input" type="number" placeholder="e.g. 520" value={wKilocalories || ""} step={1} min={0} onChange={e => setWKilocalories(isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>Avg Heart Rate</span>
    //                                         <input className="plain-input" type="number" placeholder="e.g. 145" value={wAvgHeartRate || ""} step={1} min={0} onChange={e => setWAvgHeartRate(isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))} />
    //                                     </label>
    //                                     <label className="dash-field">
    //                                         <span>VO₂max Measured</span>
    //                                         <input className="plain-input" type="number" placeholder="optional" value={wVo2maxMeasured || ""} step={0.1} min={0} onChange={e => setWVo2maxMeasured(isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))} />
    //                                     </label>
    //                                 </>
    //                             )}
    //                         </div>
    //                         <div className="workout-modal-footer">
    //                             {wError && <div className="alert alert-error">{wError}</div>}
    //                             <button
    //                                 className="btn-primary"
    //                                 onClick={editingId !== null ? () => saveWorkout(editingId) : addWorkout}
    //                                 disabled={wAdding}
    //                             >
    //                                 {wAdding ? <span className="spinner" /> : editingId !== null ? "Save Changes" : "Add Workout"}
    //                             </button>
    //                         </div>
    //                     </div>
    //                 </div>
    //             )
    //         }
    //         {
    //             metricsModalOpen && (
    //                 <div className="workout-modal-overlay" onClick={() => setMetricsModalOpen(false)}>
    //                     <div className="workout-modal animate-in" onClick={e => e.stopPropagation()}>
    //                         <div className="workout-modal-header">
    //                             <h3>Baseline Metrics</h3>
    //                             <button className="workout-modal-close" onClick={() => setMetricsModalOpen(false)} aria-label="Close">✕</button>
    //                         </div>
    //                         <div className="workout-modal-body">
    //                             {fields.map(({ label, val, set, step, min = undefined, max = undefined }) => (
    //                                 <label key={label} className="dash-field">
    //                                     <span>{label}</span>
    //                                     <input
    //                                         className="plain-input"
    //                                         type="number"
    //                                         value={val}
    //                                         step={step}
    //                                         min={min}
    //                                         max={max}
    //                                         onChange={e => set(parseFloat(e.target.value) as never)}
    //                                     />
    //                                 </label>
    //                             ))}
    //                             <label className="dash-field">
    //                                 <span>Age</span>
    //                                 <input className="plain-input" type="date" value={dob} onChange={e => setDob(e.target.value)} />
    //                             </label>
    //                             <label className="dash-field">
    //                                 <span>Sex</span>
    //                                 <select className="plain-input" value={sex} onChange={e => setSex(e.target.value as "male" | "female")}>
    //                                     <option value="male">Male</option>
    //                                     <option value="female">Female</option>
    //                                 </select>
    //                             </label>
    //                         </div>
    //                         <div className="workout-modal-footer">
    //                             <button className="btn-primary" onClick={() => { handleCompute(); setMetricsModalOpen(false); }}>
    //                                 Set Baseline Metrics
    //                             </button>
    //                         </div>
    //                     </div>
    //                 </div>
    //             )
    //         }
    //         {
    //             pwModalOpen && (
    //                 <div className="workout-modal-overlay" onClick={() => setPwModalOpen(false)}>
    //                     <div className="workout-modal animate-in" onClick={e => e.stopPropagation()}>
    //                         <div className="workout-modal-header">
    //                             <h3>Change Password</h3>
    //                             <button className="workout-modal-close" onClick={() => setPwModalOpen(false)} aria-label="Close">✕</button>
    //                         </div>
    //                         <div className="workout-modal-body">
    //                             {/* 1. Current Password Input */}
    //                             <PasswordInput
    //                                 placeholder="Current Password"
    //                                 value={pwCurrent}
    //                                 onChange={(e) => setPwCurrent(e.target.value)}
    //                                 visible={showCurrent}
    //                                 onToggleVisibility={() => setShowCurrent(!showCurrent)}
    //                                 icon={"🔒"}
    //                                 disabled={pwLoading}
    //                             />

    //                             {/* 2. New Password Input */}
    //                             <PasswordInput
    //                                 placeholder="New Password"
    //                                 value={pwNew}
    //                                 onChange={(e) => setPwNew(e.target.value)}
    //                                 visible={showNew}
    //                                 onToggleVisibility={() => setShowNew(!showNew)}
    //                                 icon={"🔒"}
    //                                 disabled={pwLoading}
    //                             />

    //                             {/* 3. Confirm New Password Input */}
    //                             <PasswordInput
    //                                 placeholder="Confirm New Password"
    //                                 value={pwConfirm}
    //                                 onChange={(e) => setPwConfirm(e.target.value)}
    //                                 visible={showConfirm}
    //                                 onToggleVisibility={() => setShowConfirm(!showConfirm)}
    //                                 icon={"🔒"}
    //                                 disabled={pwLoading}
    //                             />
    //                         </div>
    //                         <div className="workout-modal-footer">
    //                             {pwError && <div className="alert alert-error">{pwError}</div>}
    //                             {pwSuccess && <div className="alert alert-success">{pwSuccess}</div>}

    //                             {/* Your Submit Button Remains Exactly The Same Below The Inputs */}
    //                             <button
    //                                 className="btn-primary"
    //                                 disabled={pwLoading}
    //                                 onClick={async () => {
    //                                     setPwError("");
    //                                     setPwSuccess("");
    //                                     if (!pwCurrent) { setPwError("Enter your current password."); return; }
    //                                     if (pwNew.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    //                                     if (pwNew !== pwConfirm) { setPwError("New passwords do not match."); return; }
    //                                     setPwLoading(true);
    //                                     try {
    //                                         await apiFetchWithAuth("/me/password", {
    //                                             method: "PUT",
    //                                             headers: { ...authHeader, "Content-Type": "application/json" },
    //                                             body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
    //                                         });
    //                                         setPwSuccess("Password updated successfully.");
    //                                         setPwCurrent("");
    //                                         setPwNew("");
    //                                         setPwConfirm("");
    //                                     } catch (err) {
    //                                         setPwError(err instanceof Error ? err.message : "Failed to update password.");
    //                                     } finally {
    //                                         setPwLoading(false);
    //                                     }
    //                                 }}
    //                             >
    //                                 {pwLoading ? <span className="spinner" /> : "Update Password"}
    //                             </button>
    //                         </div>
    //                     </div>
    //                 </div>
    //             )
    //         }

    //         {
    //             !isOnboardingComplete && canDisplayOnboardingPopup && (
    //                 <div className="workout-modal-overlay" onClick={() => setIsOnboardingComplete(false)}>
    //                     <div className="workout-modal animate-in" onClick={e => e.stopPropagation()}>
    //                         <div className="workout-modal-header">
    //                             <h3>Welcome to Miracle Health!</h3>
    //                             {/* <button className="workout-modal-close" onClick={() => setIsOnboardingComplete(false)} aria-label="Close">✕</button> */}
    //                         </div>
    //                         <div className="workout-modal-body">
    //                             <p>Thank you for joining Miracle Health! This platform is designed to help you track your workouts, monitor your fitness progress, and provide personalized recommendations based on your data.</p>
    //                             <p>To get started, please log your sex and age. You can also explore the dashboard to see your current fitness level and recommendations.</p>
    //                             <p>If you have any questions or need assistance, feel free to reach out to our support team. We're here to help you on your fitness journey!</p>
    //                         </div>
    //                         <div className="workout-modal-body">
    //                             <label className="dash-field">
    //                                 <span>Sex</span>
    //                                 <select className="plain-input" value={sex} onChange={e => setSex(e.target.value as "male" | "female")}>
    //                                     <option value="male">Male</option>
    //                                     <option value="female">Female</option>
    //                                 </select>
    //                             </label>
    //                             <label className="dash-field">
    //                                 <span>Date of Birth</span>
    //                                 <input className="plain-input" type="date" value={dob} onChange={e => setDob(e.target.value)} />
    //                             </label>
    //                         </div>

    //                         <div className="workout-modal-footer">
    //                             <button className="btn-primary" onClick={() => {
    //                                 runCompute(computedInputs);
    //                                 setOnboardingStatusAPI(true);
    //                                 setIsOnboardingComplete(true);
    //                             }}>
    //                                 Get Started
    //                             </button>
    //                         </div>
    //                     </div>
    //                 </div>
    //             )
    //         }
    //     </div >
    // );

    const toggleTheme = () => {
        onThemeChange(theme === 'light' ? 'dark' : 'light');
    };

    if (!userForecast) {
        return (
            <div className="card animate-in dashboard">
                <div className="admin-grid" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <div className="loading-spinner">Loading your athletic forecast...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="card animate-in dashboard">
            {
                !isOnboardingComplete && canDisplayOnboardingPopup && (
                    <Onboarding
                        theme="dark"
                        sex={sex}
                        setSex={setSex}
                        dob={dob}
                        setDob={setDob}
                        onComplete={handleOnboardingSubmit}
                    />
                )
            }

            <div className="admin-header">
                {/* Group the title and theme toggle together */}
                <div className="admin-title-group">
                    <h1 className="admin-title">Dashboard</h1>
                    <button
                        className="theme-toggle-btn"
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                    >
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                </div>

                {/* All other general header actions stay grouped on the right */}
                <div className="admin-header-actions">
                    <button className="btn-secondary admin-logout-btn" onClick={onLogout}>
                        Sign out
                    </button>
                </div>
            </div>

            <div className="admin-grid">
                <CardioUserCard key={userForecast.email} forecast={userForecast} theme={theme} title="Cardio Fitness" />
                <FitnessUserCard key={userForecast.email} forecast={fitnessForecast} theme={theme} title="Fitness" k1={fitnessForecast?.k1} tau1={fitnessForecast?.tau1} rmse={fitnessForecast?.rmse} />
                <FatigueUserCard key={userForecast.email} forecast={fatigueForecast} theme={theme} title="Fatigue" k2={fatigueForecast?.k2} tau2={fatigueForecast?.tau2} rmse={fatigueForecast?.rmse} />

                <AdviceUserCard key={userForecast.email} theme={theme} title={`💡 Running Advice - ${zone2Duration.toFixed(0)}min`} blurb={
                    `Based on your parameters, we recommend at least ${zone2Duration.toFixed(0)} minutes of running or similar moderate activity per day. Zone 2 workouts require a moderate, 
                     steady effort like a light jog or a brisk power walk. You can still talk, but you can only manage short sentences before needing a breath.`
                } />
                <AdviceUserCard key={userForecast.email} theme={theme} title={`💡 Walking Advice - ${zone1Duration.toFixed(0)}min`} blurb={
                    `Based on your parameters, we recommend at least ${zone1Duration.toFixed(0)} minutes based on scheduled recommendation of walking or similar light activity. Zone 1 workouts 
                     are very light, comfortable activities like a casual walk or an easy bike ride. In this zone, you can easily carry on a full conversation without catching your breath.`
                } />

                <AdviceUserCard key={userForecast.email} theme={theme} title={`Disclaimer`} blurb={
                    `The predictions and advice provided are based on the data you have entered and the model's calculations. Always consult with a healthcare professional or certified trainer 
                     for personalized guidance. This application is for informational purposes only and should not be considered a substitute for professional medical advice, diagnosis, or treatment. 
                     Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.`
                } />
            </div>
            <div
                className="admin-user-card__disclaimer">
                <dd>© 2026 Miracle Health. All rights reserved.</dd>
            </div>
        </div>
    );
}
