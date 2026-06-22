import React from 'react';

interface AdviceUserCardProps {
    theme: "light" | "dark";
    title: string;
    blurb: string;
}

export const AdviceUserCard: React.FC<AdviceUserCardProps> = ({ theme, title, blurb }) => {
    return (
        <div className="admin-user-card">
            <div className="admin-user-card__header">
                <span className="admin-user-card__title">{title}</span>
            </div>

            <div className="admin-user-card__blurb">{blurb}</div>
            <>
            </>
        </div>
    );
};

export default AdviceUserCard;