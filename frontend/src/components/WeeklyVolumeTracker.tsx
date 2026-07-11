import React from 'react';
import './WeeklyVolumeTracker.css';

export interface ZoneVolume {
    current: number; // in minutes
    target: number;  // in minutes
    color: string;   // hex code or CSS variable
}

export interface WeeklyVolumeProps {
    theme: "light" | "dark";
    isLoading: boolean;
    runningVolume: ZoneVolume;
    walkingVolume: ZoneVolume;
}


export const WeeklyVolumeTracker: React.FC<WeeklyVolumeProps> = ({
    theme,
    isLoading,
    runningVolume,
    walkingVolume
}) => {
    
    const renderProgressBar = (zone: ZoneVolume) => {
        const percentage = Math.min((zone.current / (zone.target || 1)) * 100, 100);
        
        if (isLoading) {
            return <div className="volume-tracker__skeleton-bar" />;
        }

        return (
            <div className="volume-tracker__bar-track">
                <div 
                    className="volume-tracker__bar-fill" 
                    style={{ 
                        width: `${percentage}%`, 
                        backgroundColor: zone.color 
                    }} 
                />
            </div>
        );
    };

    return (
        <div className={`volume-tracker ${theme === 'dark' ? 'dark-theme' : ''}`}>
            <div className="volume-tracker__header">
                <h3 className="volume-tracker__title">Weekly Training Volume</h3>
                {!isLoading && (
                    <span className="volume-tracker__subtitle">Current Training Cycle</span>
                )}
            </div>

            <div className="volume-tracker__body">
                {/* 🏃‍♂️ ZONE 2: RUNNING VOLUME BLOCK */}
                <div className="volume-tracker__row">
                    <div className="volume-tracker__row-info">
                        <span className="volume-tracker__zone-label">Zone 2 Endurance (Run)</span>
                        {isLoading ? (
                            <div className="volume-tracker__skeleton-text" style={{ width: '60px' }} />
                        ) : (
                            <span className="volume-tracker__metrics">
                                <strong>{runningVolume.current}</strong> / {runningVolume.target} min
                            </span>
                        )}
                    </div>
                    {renderProgressBar(runningVolume)}
                </div>

                {/* 🚶‍♂️ ZONE 1: WALKING VOLUME BLOCK */}
                <div className="volume-tracker__row">
                    <div className="volume-tracker__row-info">
                        <span className="volume-tracker__zone-label">Zone 1 Active Recovery (Walk)</span>
                        {isLoading ? (
                            <div className="volume-tracker__skeleton-text" style={{ width: '60px' }} />
                        ) : (
                            <span className="volume-tracker__metrics">
                                <strong>{walkingVolume.current}</strong> / {walkingVolume.target} min
                            </span>
                        )}
                    </div>
                    {renderProgressBar(walkingVolume)}
                </div>
            </div>
        </div>
    );
};

export default WeeklyVolumeTracker;
