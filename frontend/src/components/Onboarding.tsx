import React from 'react';

// 1. Declare everything you need to receive from the parent component
interface OnboardingProps {
    theme: "dark" | "light";
    title?: string;
    sex: "male" | "female";
    setSex: (value: "male" | "female") => void;
    dob: string;
    setDob: (value: string) => void;
    onComplete: () => void; // Pass the entire action bundle function here
}

export const Onboarding: React.FC<OnboardingProps> = ({
    theme,
    sex,
    setSex,
    dob,
    setDob,
    onComplete
}) => {
    return (
        /* Clicking outside or closing the overlay triggers the complete/hide function */
        <div className="workout-modal-overlay" onClick={onComplete}>
            <div className="workout-modal animate-in" onClick={e => e.stopPropagation()}>
                <div className="admin-user-card__header">
                    <h3>Welcome to Miracle Health!</h3>
                </div>

                <div className="admin-user-card__blurb">
                    <p>Thank you for joining Miracle Health! This platform is designed to help you track your workouts, monitor your fitness progress, and provide personalized recommendations based on your data. To get started, please log your sex and age.</p>
                </div>

                <hr className="form-separator" />

                <div className="admin-user-card__body">
                    <label className="dash-field">
                        <span>Sex</span>
                        <select
                            className="plain-input"
                            value={sex}
                            onChange={e => setSex(e.target.value as "male" | "female")}
                        >
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                        </select>
                    </label>
                    <label className="dash-field">
                        <span>Date of Birth</span>
                        <input
                            className="plain-input"
                            type="date"
                            value={dob}
                            onChange={e => setDob(e.target.value)}
                        />
                    </label>
                </div>

                <div className="admin-user-card__footer">
                    {/* 2. Execute the function prop when clicked */}
                    <button className="btn-primary" onClick={onComplete}>
                        Get Started
                    </button>
                </div>
            </div>
        </div>
    );
};


export default Onboarding;
