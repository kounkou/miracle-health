import React from 'react';
import './WorkoutBadge.css';

interface WorkoutBadgeProps {
    workoutDate: string | Date; // Accepts "2026-06-28" or standard Date objects
    theme: "light" | "dark";
}

export const WorkoutBadge: React.FC<WorkoutBadgeProps> = ({ workoutDate, theme }) => {
    // 2. Pure helper function to format upcoming workout days cleanly
    const formatDayOffset = (daysAhead: number | null): string => {
        const daysAheadAsInt = daysAhead !== null ? Math.round(daysAhead) : null;
        if (daysAheadAsInt === null) return "—";
        if (daysAheadAsInt === 0) return "Today";
        if (daysAheadAsInt === 1) return "Tomorrow";
        if (daysAheadAsInt < 0) return "Overdue";
        return `In ${daysAheadAsInt} days`;
    };

    console.log(`workoutDate: ${workoutDate}`); // Debugging log

    const todayDateStr = formatDayOffset(0);

    // Only render the badge if the workout is scheduled for today
    if (workoutDate !== todayDateStr) return null;

    return (
        <span className={`workout-badge ${theme === 'dark' ? 'workout-badge--dark' : 'workout-badge--light'}`}>
            <span className="workout-badge__dot"></span>
            TODAY
        </span>
    );
};

export default WorkoutBadge;
