import React from 'react';
import './OvertrainingAlert.css';

interface OvertrainingAlertProps {
    theme: "light" | "dark";
    isLoading: boolean;
    scheduledHiitDateStr: string;   // The user's targeted workout date (e.g., "2026-07-14")
    lastHiitDateStr: string;        // Date of the last completed HIIT session (e.g., "2026-07-10")
    tau2: number;                   // Model Fatigue Decay Constant (e.g., 8.86)
}

export const OvertrainingAlert: React.FC<OvertrainingAlertProps> = ({
    theme,
    isLoading,
    scheduledHiitDateStr,
    lastHiitDateStr,
    tau2
}) => {
    if (isLoading) {
        return (
            <div className="alert-card alert-card--loading">
                <div className="alert-card__skeleton" />
            </div>
        );
    }

    // 1. Calculate precise date differentials
    const lastHiit = new Date(lastHiitDateStr + "T00:00:00Z");
    const scheduledHiit = new Date(scheduledHiitDateStr + "T00:00:00Z");
    
    // Day delta between scheduled target and previous stress injection
    const dayDelta = (scheduledHiit.getTime() - lastHiit.getTime()) / (1000 * 60 * 60 * 24);

    // 2. Compute minimum safe threshold day allocation
    const safeDaysRequired = -tau2 * Math.log(0.20); // 80% clearance point
    
    // 🚀 CRITICAL EVALUATION: True if training before the 80% neural recovery mark
    const isOvertrainingRisk = dayDelta < safeDaysRequired;

    // Early exit if everything is completely clear and no alert is needed
    if (!isOvertrainingRisk) return null;

    const actualClearanceDate = new Date(lastHiit.getTime() + safeDaysRequired * 24 * 60 * 60 * 1000);
    const readableSafeDate = actualClearanceDate.toLocaleDateString('en-CA', { 
        month: 'short', 
        day: 'numeric' 
    });

    return (
        <div className={`alert-card alert-card--danger ${theme === 'dark' ? 'dark-theme' : ''}`}>
            <div className="alert-card__header">
                <span className="alert-card__icon" role="img" aria-label="warning">🚨</span>
                <h4 className="alert-card__title">Overtraining / Overreaching Alert</h4>
            </div>
            <div className="alert-card__body">
                <p className="alert-card__text">
                    You are trying to schedule an explosive **HIIT session too early**. 
                    Your central nervous system will only achieve **80% neural clearance** on 
                    <strong> {readableSafeDate}</strong> ({Math.ceil(safeDaysRequired - dayDelta)} days later than planned).
                </p>
                <div className="alert-card__metrics-badge">
                    Current Estimated Clearance: {Math.round((1 - Math.exp(-dayDelta / tau2)) * 100)}% / 80% Required
                </div>
            </div>
        </div>
    );
};

export default OvertrainingAlert;
