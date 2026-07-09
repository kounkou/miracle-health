import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './AdviceUserCard.css';

interface AdviceUserCardProps {
    theme: "light" | "dark";
    title: string;
    blurb: React.ReactNode;
    targetMinutes: number;
    accomplishedMinutes: number;
    isTracker: boolean;
}

export const AdviceUserCard: React.FC<AdviceUserCardProps> = ({
    theme,
    title,
    blurb,
    targetMinutes,
    accomplishedMinutes,
    isTracker
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const percentage = Math.min((accomplishedMinutes / (targetMinutes || 1)) * 100, 100);
    const isCompleted = accomplishedMinutes >= targetMinutes && targetMinutes > 0;

    const radius = 35;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const displayPercentage = Math.round(percentage);

    const togglePopup = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const renderDonutChart = () => {
        if (targetMinutes <= 0) return null;
        return (
            <div className={`admin-user-card__donut-container ${isCompleted ? 'is-completed' : ''}`}>
                <svg width="100%" height="100%" viewBox="0 0 90 90" className="admin-user-card__donut-svg">
                    <circle cx="45" cy="45" r={radius} className="admin-user-card__donut-bg" />
                    <circle
                        cx="45"
                        cy="45"
                        r={radius}
                        className="admin-user-card__donut-fill"
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
                        {displayPercentage}%
                    </text>
                </svg>
            </div>
        );
    };

    return (
        <>
            {/* NORMAL STATE CARD */}
            <div
                className={`admin-user-card admin-user-card--clickable ${theme === 'dark' ? 'dark-theme' : ''}`}
                onClick={togglePopup}
            >
                <div className="admin-user-card__header">
                    <span className="admin-user-card__title">{title}</span>
                    {renderDonutChart()}
                </div>
                <div className="admin-user-card__body">
                    <div className="admin-user-card__blurb admin-user-card__blurb--truncated">{blurb}</div>
                </div>
            </div>

            {/* FIXED POPUP STATE USING PORTALS */}
            {isOpen && createPortal(
                <div className={`admin-user-card__overlay ${theme === 'dark' ? 'dark-theme' : ''}`} onClick={togglePopup}>
                    <div className="advice-popup-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="admin-user-card__close-btn" onClick={togglePopup}>&times;</button>
                        <div className="admin-user-card__header" style={{ height: 'auto', marginBottom: '24px' }}>
                            <span className="admin-user-card__title">{title}</span>
                            {renderDonutChart()}
                        </div>
                        <div className="admin-user-card__body" style={{ display: 'block' }}>
                            <div className="admin-user-card__blurb admin-user-card__blurb--full">{blurb}</div>
                        </div>
                        {!!isTracker && (
                            <div className="admin-user-card__footer">
                                <span>Progress: {accomplishedMinutes.toFixed(0)}m / {targetMinutes.toFixed(0)}m</span>
                            </div>
                        )}
                    </div>
                </div>,
                document.body // Forces rendering at the root body node to protect centering logic
            )}
        </>
    );
};

export default AdviceUserCard;
