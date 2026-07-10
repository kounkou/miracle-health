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
    imageUrl?: string;
    isLoading: boolean;
}

export const AdviceUserCard: React.FC<AdviceUserCardProps> = ({
    theme,
    title,
    blurb,
    targetMinutes,
    accomplishedMinutes,
    isTracker,
    imageUrl,
    isLoading
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
        // If the card is loading, show a small localized spinner instead of the donut chart numbers
        if (isLoading) {
            return (
                <div className="admin-user-card__donut-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="loading-spinner" style={{ width: '24px', height: '24px', borderWidth: '2px' }} />
                </div>
            );
        }

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
                className={`admin-user-card ${!isLoading ? 'admin-user-card--clickable' : ''} ${theme === 'dark' ? 'dark-theme' : ''}`}
                onClick={isLoading ? undefined : togglePopup} // Disable clicking entirely during loading phase
                style={{ opacity: isLoading ? 0.85 : 1 }}
            >
                <div className="admin-user-card__header">
                    <span className="admin-user-card__title">{title}</span>
                    {renderDonutChart()}
                </div>
                <div className="admin-user-card__body">
                    {isLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            <div className="skeleton-text-bone" style={{ width: '100%' }} />
                            <div className="skeleton-text-bone" style={{ width: '85%' }} />
                        </div>
                    ) : (
                        <div className="admin-user-card__blurb admin-user-card__blurb--truncated">{blurb}</div>
                    )}
                </div>
            </div>

            {/* FIXED POPUP STATE USING PORTALS */}
            {isOpen && !isLoading && createPortal(
                <div className={`admin-user-card__overlay ${theme === 'dark' ? 'dark-theme' : ''}`} onClick={togglePopup}>
                    <div className="advice-popup-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="admin-user-card__close-btn" onClick={togglePopup}>&times;</button>
                        <div className="admin-user-card__header" style={{ height: 'auto', marginBottom: '24px' }}>
                            <span className="admin-user-card__title">{title}</span>
                            {renderDonutChart()}
                        </div>

                        {imageUrl && (
                            <div className="advice-popup-modal__image-wrapper">
                                <img src={imageUrl} alt={title} className="advice-popup-modal__img" />
                            </div>
                        )}

                        <div className="admin-user-card__body" style={{ display: 'block' }}>
                            <div className="admin-user-card__blurb admin-user-card__blurb--full">{blurb}</div>
                        </div>
                        {!!isTracker && (
                            <div className="admin-user-card__footer">
                                <span>Progress: {(accomplishedMinutes || 0).toFixed(0)}m / {(targetMinutes || 0).toFixed(0)}m</span>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default AdviceUserCard;