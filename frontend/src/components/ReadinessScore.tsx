import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './AdviceUserCard.css';

interface ReadinessScoreProps {
    theme: "light" | "dark";
    isLoading: boolean;
    w1: number;       // Chronic Fitness Accumulator
    w2: number;       // Acute Fatigue Accumulator
    k1: number;       // Fitness Gain Parameter
    k2: number;       // Fatigue Penalty Parameter
    imageUrl?: string;
    daysSinceLastHiit;
    daysSinceLastZone2;
}

export const ReadinessScore: React.FC<ReadinessScoreProps> = ({
    theme,
    isLoading,
    w1,
    w2,
    k1,
    k2,
    imageUrl,
    daysSinceLastHiit = 1,  // e.g., Yesterday = 1 day ago
    daysSinceLastZone2 = 2  // e.g., 2 days ago
}) => {
    const [isOpen, setIsOpen] = useState(false);

    // 1. Compute raw physical Banister Training Stress Balance
    const fitnessSignal = w1 * k1;
    const fatigueSignal = w2 * k2;
    const tsb = fitnessSignal - fatigueSignal;

    const equilibriumScore = 70;
    const sensitivityScalar = 4.5;
    const baseRawScore = equilibriumScore + (tsb * sensitivityScalar);
    let score = Math.max(0, Math.min(100, Math.round(baseRawScore)));

    let acuteSuppressionPenalty = 0;

    if (daysSinceLastHiit <= 5.0) {
        // Half-life style decay: Day 1 = 45%, Day 2 = 22.5%, Day 3 = 11.25%
        acuteSuppressionPenalty = 45 / Math.pow(2, daysSinceLastHiit - 1);
    } else if (daysSinceLastZone2 <= 2.0) {
        acuteSuppressionPenalty = 20 / Math.pow(2, daysSinceLastZone2 - 1);
    }

    // Apply the acute suppression penalty directly to the final score
    score = Math.max(0, score - acuteSuppressionPenalty);

    // 3. Evaluate 4-Quartile Tier Allocations and prescribe the appropriate workout
    let zoneLabel = "";
    let zoneColor = "";
    let batteryEmoji = "🔋";
    let dynamicRecommendation = "";
    let allowedActivities: string[] = [];

    if (score > 75) {
        // 🟢 QUARTILE 4: Supercompensation Peak (76% - 100%)
        zoneLabel = "Optimal Peak State";
        zoneColor = "#34c759"; // Success Green
        batteryEmoji = "🔋";
        allowedActivities = ["HIIT Intervals", "Zone 2 Running", "Zone 1 Walking"];
        dynamicRecommendation = "GREEN LIGHT: Your neuromuscular pathways are fully fresh. Today is the perfect time for high-velocity or explosive workouts like HIIT or a race simulation.";
    } else if (score > 50) {
        // 🟡 QUARTILE 3: Adaptive Accumulation (51% - 75%)
        zoneLabel = "Adaptive Accumulation Window";
        zoneColor = "#ffcc00"; // Bright Yellow
        batteryEmoji = "⚡";
        allowedActivities = ["Zone 2 Running", "Zone 1 Walking"];
        dynamicRecommendation = "AEROBIC ONLY: Your system is absorbing recent stress. Your body is ready for steady-state cardiovascular volume (Zone 2 runs or cycling), but explosive intervals (HIIT) should be delayed.";
    } else if (score > 25) {
        // 🟠 QUARTILE 2: Acute Fatigue Load (26% - 50%)
        zoneLabel = "Heavy Fatigue Clearance Phase";
        zoneColor = "#ff9500"; // Warning Orange
        batteryEmoji = "🪫";
        allowedActivities = ["Zone 1 Walking Only"];
        dynamicRecommendation = "ACTIVE RECOVERY: Significant residual fatigue is present. Avoid structural muscle damage. Keep activity restricted strictly to low-intensity Zone 1 active recovery walks to help flush metabolic waste.";
    } else {
        // 🔴 QUARTILE 1: Deep Structural Exhaustion (0% - 25%)
        zoneLabel = "Systemic Exhaustion / Taper Mandatory";
        zoneColor = "#ff3b30"; // Danger Red
        batteryEmoji = "⚠️";
        allowedActivities = ["None - Rest Day Required"];
        dynamicRecommendation = "CRITICAL REST: Extreme acute training stress has overwhelmed your baseline adaptations. High risk of neural burnout or soft-tissue injury. Commit to a full passive rest day today.";
    }

    const radius = 35;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    const togglePopup = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const renderDonutChart = () => {
        if (isLoading) {
            return (
                <div className="admin-user-card__donut-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="loading-spinner" style={{ width: '24px', height: '24px', borderWidth: '2px' }} />
                </div>
            );
        }

        return (
            <div className="admin-user-card__donut-container">
                <svg width="100%" height="100%" viewBox="0 0 90 90" className="admin-user-card__donut-svg">
                    <circle cx="45" cy="45" r={radius} className="admin-user-card__donut-bg" />
                    <circle
                        cx="45"
                        cy="45"
                        r={radius}
                        className="admin-user-card__donut-fill"
                        stroke={zoneColor}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        transform="rotate(-90 45 45)"
                    />
                    <text
                        x="45"
                        y="45"
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="admin-user-card__donut-label"
                        transform="rotate(90 45 45)"
                    >
                        {score}%
                    </text>
                </svg>
            </div>
        );
    };

    const blurbContent = (
        <span>
            Status: <span style={{ color: zoneColor, fontWeight: 700 }}>{zoneLabel}</span>
            <br />
            Recommended Today:{" "}
            <strong style={{ color: theme === 'dark' ? '#fff' : '#000' }}>
                {allowedActivities.join(" • ")}
            </strong>
            <br />
            <br />
            {dynamicRecommendation}
        </span>
    );

    return (
        <>
            {/* NORMAL STATE CARD */}
            <div
                className={`admin-user-card ${!isLoading ? 'admin-user-card--clickable' : ''} ${theme === 'dark' ? 'dark-theme' : ''}`}
                onClick={isLoading ? undefined : togglePopup}
                style={{ opacity: isLoading ? 0.85 : 1 }}
            >
                <div className="admin-user-card__header">
                    <span className="admin-user-card__title">{batteryEmoji} Systemic Readiness - beta</span>
                    {renderDonutChart()}
                </div>
                <div className="admin-user-card__body">
                    {isLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            <div className="skeleton-text-bone" style={{ width: '100%' }} />
                            <div className="skeleton-text-bone" style={{ width: '85%' }} />
                        </div>
                    ) : (
                        <div className="admin-user-card__blurb admin-user-card__blurb--truncated">{blurbContent}</div>
                    )}
                </div>
            </div>

            {/* FIXED POPUP STATE USING PORTALS */}
            {isOpen && !isLoading && createPortal(
                <div className={`admin-user-card__overlay ${theme === 'dark' ? 'dark-theme' : ''}`} onClick={togglePopup}>
                    <div className="advice-popup-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="admin-user-card__close-btn" onClick={togglePopup}>&times;</button>
                        <div className="admin-user-card__header" style={{ height: 'auto', marginBottom: '24px' }}>
                            <span className="admin-user-card__title">{batteryEmoji} Systemic Readiness - beta</span>
                            {renderDonutChart()}
                        </div>

                        {imageUrl && (
                            <div className="advice-popup-modal__image-wrapper">
                                <img src={imageUrl} alt="Readiness State Visualizer" className="advice-popup-modal__img" />
                            </div>
                        )}

                        <div className="admin-user-card__body" style={{ display: 'block' }}>
                            <div className="admin-user-card__blurb admin-user-card__blurb--full">{blurbContent}</div>
                        </div>
                        <div className="admin-user-card__footer">
                            <span>Calculated Model Training Stress Balance (TSB): {tsb.toFixed(3)}</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ReadinessScore;
