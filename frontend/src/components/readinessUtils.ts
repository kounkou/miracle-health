export interface TimelineScheduleStep {
  daysHiit?: number;             // Fractional days elapsed since the last HIIT workout
  daysZone2?: number;            // Fractional days elapsed since the last Zone 2 run
}

export interface ReadinessInputs {
  fitnessSignal: number;
  fatigueSignal: number;
  k1: number;
  k2: number;
}

export interface ScoreResult {
  score: number;
  tsb: number;
}

function tsbOf(bm, variant) {
  const F = bm.fitnessSignal, G = bm.fatigueSignal, k1 = bm.k1, k2 = bm.k2;
  switch (variant) {
    case 'raw': return F - G;
    case 'k': return F*k1 - G*k2;
    case 'rawRev': return G - F;
    case 'kRev': return G*k2 - F*k1;
  }
}

export const calculateReadinessScore = (baselineMetrics: ReadinessInputs, schedule: TimelineScheduleStep): ScoreResult => {
    const kFactor = 51.1890;
    const tsbOffset = 0.3357;
    const baseHiit = 66.0373;
    const hiitWindow = 5.4678;
    const baseZone2 = 36.3245;
    const zone2Window = 1.7832;
    const blend = -0.0885;
    const variant = 'kRev';

    const tsb = tsbOf(baselineMetrics, variant);
    const baseRaw = 100/(1+Math.exp(-kFactor*(tsb+tsbOffset)));
    const sched = schedule;
    let hiitPenalty = 0, zone2Penalty = 0;
    if (sched.daysHiit !== undefined && sched.daysHiit <= hiitWindow) {
      hiitPenalty = baseHiit * Math.max(0, 1 - (sched.daysHiit/hiitWindow));
    }
    if (sched.daysZone2 !== undefined && sched.daysZone2 <= zone2Window) {
      zone2Penalty = baseZone2 * Math.max(0, 1 - (sched.daysZone2/zone2Window));
    }
    let pen = hiitPenalty + zone2Penalty;

    let score = Math.round(baseRaw - pen);

    return { score, tsb };
};