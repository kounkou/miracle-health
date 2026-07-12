import React, { useMemo } from 'react';

// Interfaces matching your existing architecture
interface BanisterMetrics {
  w1: number; // Chronic Fitness
  k1: number;
}

interface FriendRecommendation {
  id: string;
  name: string;
  avatar: string;
  readinessScore: number;
  fitnessSignal: number;
  matchScore: number;
  recommendedWorkout: 'HIIT Partner' | 'Zone 2 Cruise' | 'Recovery Walk' | 'Rest Day Peer';
}

interface WorkoutBuddyMatcherProps {
  userScore: number;
  userMetrics: BanisterMetrics;
  friends: Array<{ id: string; name: string; avatar: string; readinessScore: number; w1: number; k1: number }>;
}

export const WorkoutBuddyMatcher: React.FC<WorkoutBuddyMatcherProps> = ({
  userScore,
  userMetrics,
  friends,
}) => {
  const userFitness = userMetrics.w1 * userMetrics.k1;

  // Compute recommendations dynamically using Banister & Readiness logic
  const recommendations = useMemo(() => {
    return friends
      .map((friend): FriendRecommendation => {
        const friendFitness = friend.w1 * friend.k1;
        
        // 1. Calculate delta gaps
        const readinessDelta = Math.abs(userScore - friend?.readinessScore);
        const fitnessDelta = Math.abs(userFitness - friendFitness);

        // 2. Normalize a match score (Lower deltas = Higher match percentage)
        const matchScore = Math.max(0, Math.round(100 - (readinessDelta * 0.6 + fitnessDelta * 40)));

        // 3. Classify workout type based on mutual current readiness thresholds
        let recommendedWorkout: FriendRecommendation['recommendedWorkout'] = 'Recovery Walk';
        const averageReadiness = (userScore + friend.readinessScore) / 2;

        if (averageReadiness >= 75) {
          recommendedWorkout = 'HIIT Partner';
        } else if (averageReadiness >= 50) {
          recommendedWorkout = 'Zone 2 Cruise';
        } else if (userScore < 40 && friend.readinessScore < 40) {
          recommendedWorkout = 'Rest Day Peer';
        }

        return { ...friend, fitnessSignal: friendFitness, matchScore, recommendedWorkout };
      })
      .sort((a, b) => b.matchScore - a.matchScore); // Best matches first
  }, [friends, userScore, userFitness]);

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800">
      {/* Header section */}
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">Physiology-Matched Buddies</h2>
        <p className="text-xs text-slate-400 mt-1">Based on Banister fitness levels and your current <strong>{userScore}% Readiness</strong>.</p>
      </div>

      {/* Recommendations Feed */}
      <div className="space-y-4">
        {recommendations.slice(0, 3).map((friend) => (
          <div key={friend.id} className="flex items-center justify-between p-4 bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-indigo-500 transition-colors">
            
            {/* Left: Avatar & Meta */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-indigo-400">
                {friend.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-sm font-semibold">{friend.name}</h3>
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 mt-1 rounded-full ${
                  friend.recommendedWorkout === 'HIIT Partner' ? 'bg-rose-500/20 text-rose-400' :
                  friend.recommendedWorkout === 'Zone 2 Cruise' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  🎯 {friend.recommendedWorkout}
                </span>
              </div>
            </div>

            {/* Right: Analytical Compatibility Data */}
            <div className="text-right">
              <div className="text-xs font-bold text-indigo-400">{friend.matchScore}% Match</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Readiness: {friend.readinessScore}%</div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
};
