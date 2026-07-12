import { describe, it, expect } from 'vitest'; // Swap to 'jest' if using Jest
import { calculateReadinessScore } from './readinessUtils';

// Standard baseline constants where TSB calculates to approximately 0.285
const baselineMetrics = [
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.6571436264149877,  fatigueSignal:  0.23645189464059230 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.5997136704658337,  fatigueSignal:  0.21202729271176532 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.5442740065998453,  fatigueSignal:  0.19012566138669873 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.4907556592708833,  fatigueSignal:  0.17048638717879458 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.4390920433487717,  fatigueSignal:  0.15287577700603486 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.3892188812770607,  fatigueSignal:  0.13708427741323986 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.3410741231017698,  fatigueSignal:  0.12292398103833202 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.2945978692716158,  fatigueSignal:  0.11022639065136751 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.2497322961136745,  fatigueSignal:  0.09884041416002565 },
  { k1: 0.28459582764286456, k2:  0.6441554475828417,  fitnessSignal:  1.2064215838917578,  fatigueSignal:  0.08863056672357980 }
];

// Define the full 10-day training interval timeline tracking layout
const schedule = [
  { daysHiit: 1.0,  daysZone2: 2.0 }, // Friday (Morning-after HIIT)
  { daysHiit: 2.0,  daysZone2: 3.0 }, // Saturday
  { daysHiit: 3.0,  daysZone2: 4.0 }, // Sunday
  { daysHiit: 4.0,  daysZone2: 0.0 }, // Monday (Fresh Zone 2 Run Stacking)
  { daysHiit: 5.0,  daysZone2: 1.0 }, // Tuesday
  { daysHiit: 6.0,  daysZone2: 2.0 }, // Wednesday (All acute penalties clear)
  { daysHiit: 7.0,  daysZone2: 0.0 }, // Thursday (Second Zone 2 Run Stacking)
  { daysHiit: 8.0,  daysZone2: 1.0 }, // Friday
  { daysHiit: 9.0,  daysZone2: 2.0 }, // Saturday
  { daysHiit: 10.0, daysZone2: 3.0 }  // Sunday (Peak Recovery Window)
];

describe('Readiness Score Mathematical Consistency', () => {
  it('should accurately process cascading acute penalties and raw baseline recovery over 9 days', () => {

    const result = [];

    // Syntactically updated structural execution loop tracking variables cleanly
    for (let i = 0; i < schedule.length; i++) {
      result[i] = calculateReadinessScore(baselineMetrics[i], schedule[i]);
    }

    // --- EXPLICIT RUNTIME SNAPSHOTS ---
    expect(result[0].score).toMatchInlineSnapshot(`16`);  // Heavy exhaustion post-HIIT, but safely above zero floor
    expect(result[1].score).toMatchInlineSnapshot(`29`);  // Deep neural fatigue (Typical morning-after state)
    expect(result[2].score).toMatchInlineSnapshot(`42`);  // Clear structural recovery 48 hours later
    expect(result[3].score).toMatchInlineSnapshot(`21`);  // Noticeable crash from stacking Zone 2 onto HIIT fatigue
    expect(result[4].score).toMatchInlineSnapshot(`56`);  // Resilient bounce-back as HIIT penalty completely drops
    expect(result[5].score).toMatchInlineSnapshot(`81`);  // Fully recovered to normal training base functionality
    expect(result[6].score).toMatchInlineSnapshot(`48`);  // Isolated Zone 2 drop (Physiologically much safer than Monday's 21!)
    expect(result[7].score).toMatchInlineSnapshot(`72`);  // Clean, unburdened recovery progression
    expect(result[8].score).toMatchInlineSnapshot(`90`);  // Breaking through to peak performance readiness
    expect(result[9].score).toMatchInlineSnapshot(`93`);  // True Supercompensation achieved after complete rest!
  });
});