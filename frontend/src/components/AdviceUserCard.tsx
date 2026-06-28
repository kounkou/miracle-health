import React from 'react';
import './AdviceUserCard.css'; // Make sure the path matches your project structure

interface AdviceUserCardProps {
    theme: "light" | "dark";
    title: string;
    blurb: string;
    targetMinutes: number;
    accomplishedMinutes: number;
}

export const AdviceUserCard: React.FC<AdviceUserCardProps> = ({
    theme,
    title,
    blurb,
    targetMinutes,
    accomplishedMinutes
}) => {
    const percentage = Math.min((accomplishedMinutes / (targetMinutes || 1)) * 100, 100);

    // SVG Geometric Configurations
    const radius = 35;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <div className={`admin-user-card ${theme === 'dark' ? 'dark-theme' : ''}`}>
            <div className="admin-user-card__header">
                <span className="admin-user-card__title">{title}</span>
                {targetMinutes > 0 && (
                    <div className="admin-user-card__donut-container">
                        <svg width="100%" height="100%" viewBox="0 0 90 90" className="admin-user-card__donut-svg">
                            <circle
                                cx="45"
                                cy="45"
                                r={radius}
                                className="admin-user-card__donut-bg"
                            />
                            <circle
                                cx="45"
                                cy="45"
                                r={radius}
                                className="admin-user-card__donut-fill"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                            />
                        </svg>
                        {/* <div className="admin-user-card__donut-text-box">
                            <span className="admin-user-card__donut-percentage">
                                {Math.round(percentage)}%
                            </span>
                            <span className="admin-user-card__donut-fraction">
                                {accomplishedMinutes}/{targetMinutes}m
                            </span>
                        </div> */}
                    </div>
                )}
            </div>

            <div className="admin-user-card__body">
                <div className="admin-user-card__blurb">{blurb}</div>
            </div>
        </div>
    );
};

export default AdviceUserCard;
