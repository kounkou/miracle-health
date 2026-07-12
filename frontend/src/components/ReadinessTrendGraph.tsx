import React, { useEffect, useRef, useMemo } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';

export interface DailyReadinessData {
  dayName: string;      // e.g., "Mon", "Tue"
  dateString: string;    // e.g., "July 14"
  score: number;         // 0 to 100
  workoutType?: 'HIIT' | 'Zone 2' | 'Walk' | 'None';
}

interface ReadinessTrendGraphProps {
  data: DailyReadinessData[];
}

export const ReadinessTrendGraph: React.FC<ReadinessTrendGraphProps> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);

  // Take the last 30 days to match your exact timeline sequence window
  const monthlyData = useMemo(() => data.slice(-30), [data]);

  // Color mapping matching your existing physical strain zones
  const getZoneColor = (score: number) => {
    if (score >= 75) return "#34c759"; // "Optimal Peak State";
    if (score > 50) return "#ffcc00";  // "Adaptive Accumulation Window";
    if (score > 25) return "#ff9500";  // "Heavy Fatigue Clearance Phase";
    return "#ff3b30";                  // "Systemic Exhaustion / Taper Mandatory";
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    // Cleanly destroy existing instance to handle overlay state toggles safely
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const labels = monthlyData.map(d => {
      const match = d.dateString.match(/([A-Za-z]+)\s+(\d+)/);

      if (match) {
        const monthAbbreviation = match[1].substring(0, 3);
        const dayNumber = match[2];
        return `${monthAbbreviation} ${dayNumber}`;
      }
      return d.dayName;
    });

    const scores = monthlyData.map(d => d.score);
    const pointColors = monthlyData.map(d => getZoneColor(d.score));
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent-2").trim() || "#0a84ff";
    const muted = styles.getPropertyValue("--muted").trim() || "#8e8e93";
    const textColor = styles.getPropertyValue("--text").trim() || "#fff";
    const surface2 = styles.getPropertyValue("--surface-2").trim() || "#2c2c2e";
    const border = styles.getPropertyValue("--border").trim() || "#38383a";

    // 🚀 STYLED TO MATCH FITNESS/FATIGUE SIGNALS
    // chartInstanceRef.current = new ChartJS(ctx, {
    //   type: 'line',
    //   data: {
    //     labels: labels,
    //     datasets: [
    //         {
    //             data: scores,
    //             borderColor: accent,
    //             backgroundColor: `${accent}22`,
    //             pointBackgroundColor: pointColors,
    //             borderWidth: 2,
    //             pointRadius: 4,
    //             fill: true,
    //             tension: 0.35,
    //             pointBorderColor: border, 
    //             pointBorderWidth: 1.5,
    //             pointHoverRadius: 6,
    //             pointHoverBackgroundColor: border,
    //             pointHoverBorderColor: border,
    //             pointHoverBorderWidth: 2,
    //         },
    //     ],
    //   },
    //   options: {
    //     responsive: true,
    //     maintainAspectRatio: false,
    //     plugins: {
    //         legend: { display: false },
    //         tooltip: {
    //             titleColor: textColor,
    //             bodyColor: textColor,
    //             backgroundColor: surface2,
    //             borderColor: border,
    //             borderWidth: 1,
    //             padding: 10,
    //             cornerRadius: 8,
    //             displayColors: false,
    //             callbacks: {
    //                 // 🧠 FIXED: title receives an array. We access the first index.
    //                 title: (context) => {
    //                 if (!context || context.length === 0) return '';
    //                 const index = context[0].dataIndex;
    //                 const step = monthlyData[index];
    //                 return `${step.dayName.toUpperCase()} • ${step.dateString}`;
    //                 },
    //                 // 🧠 FIXED: label receives a single context item object directly.
    //                 label: (context) => {
    //                 const index = context.dataIndex;
    //                 const step = monthlyData[index];
    //                 return ` Readiness: ${step.score}%`;
    //                 },
    //                 // 🧠 FIXED: afterBody receives an array. We access the first index.
    //                 afterBody: (context) => {
    //                 if (!context || context.length === 0) return '';
    //                 const index = context[0].dataIndex;
    //                 const step = monthlyData[index];
    //                 if (step.workoutType && step.workoutType !== 'None') {
    //                     return `\n🎯 Stressor: ${step.workoutType}`;
    //                 }
    //                 return '';
    //                 }
    //             }
    //         },
    //     },
    //     scales: {
    //         x: {
    //             bounds: 'ticks',
    //             ticks: {
    //                 color: muted,
    //                 font: { size: 10 },
    //                 maxTicksLimit: 5,
    //                 maxRotation: 0,
    //             },
    //             grid: { display: false, color: `${muted}22` },
    //         },
    //         y: {
    //             ticks: {
    //                 color: muted,
    //                 font: { size: 10 },
    //                 maxTicksLimit: 4,
    //             },
    //             grid: {
    //                 color: `${muted}22`,
    //             },
    //         },
    //     },
    //  }
    // });

    chartInstanceRef.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
            {
                data: scores,
                borderColor: accent,
                backgroundColor: `${accent}11`, // Lightened slightly for a premium gradient tint
                pointBackgroundColor: pointColors,
                borderWidth: 2.5, // Slightly thicker line holds a smoother visual weight
                
                // 🧠 MAX VISUAL SMOOTHNESS ANCHORS
                tension: 0.3,                          // Optimal smooth curve tension
                cubicInterpolationMode: 'monotone',    // Prevents line from bending past 100 or below 0
                
                // 🧠 MONTHLY VIEW DATA DENSITY CLEANUP
                // Static points are hidden to make the line perfectly smooth; they appear on cursor hover
                pointRadius: 0,                        
                pointHitRadius: 15,                    // Enlarges the invisible hover interaction zone
                fill: true,
                
                pointBorderColor: border, 
                pointBorderWidth: 1.5,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: border,
                pointHoverBorderColor: border,
                pointHoverBorderWidth: 2,
            },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Performance helper ensuring smooth drawing across retina viewports
        devicePixelRatio: window.devicePixelRatio || 2,
        // Fluid hover interaction tracking layout
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                titleColor: textColor,
                bodyColor: textColor,
                backgroundColor: surface2,
                borderColor: border,
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                displayColors: false,
                callbacks: {
                    title: (context) => {
                        if (!context || context.length === 0) return '';
                        const index = context[0].dataIndex;
                        const step = monthlyData[index];
                        return `${step.dayName.toUpperCase()} • ${step.dateString}`;
                    },
                    label: (context) => {
                        const index = context.dataIndex;
                        const step = monthlyData[index];
                        return ` Readiness: ${step.score}%`;
                    },
                    afterBody: (context) => {
                        if (!context || context.length === 0) return '';
                        const index = context[0].dataIndex;
                        const step = monthlyData[index];
                        if (step.workoutType && step.workoutType !== 'None') {
                            return `\n🎯 Stressor: ${step.workoutType}`;
                        }
                        return '';
                    }
                }
            },
        },
        scales: {
            x: {
                bounds: 'ticks',
                ticks: {
                    color: muted,
                    font: { size: 10, family: 'system-ui' },
                    maxTicksLimit: 5,
                    maxRotation: 0,
                    autoSkip: true,
                    autoSkipPadding: 30, 
                },
                grid: { display: false, color: `${muted}22` },
                border: { display: false }
            },
            // 🧠 COMPRESSED PHYSIOLOGICAL Y-AXIS
            y: {
                // Expanding boundaries flattens the line, cushioning peaks and valleys
                min: -15, 
                max: 115, 
                ticks: {
                    color: muted,
                    font: { size: 10, family: 'system-ui' },
                    maxTicksLimit: 4,
                    // Forces label steps to display logical milestones on the dashboard
                    callback: (value) => {
                        // Hide the padding ticks so your UI labels remain clean (0 to 100)
                        if (value < 0 || value > 100) return null;
                        return `${value}%`;
                    }
                },
                grid: {
                    color: `${muted}11`, 
                    drawTicks: false
                },
                border: { display: false }
            },
        },
     }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [monthlyData]);


  return (
    <div className="w-full h-full relative" style={{ minHeight: '220px' }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default ReadinessTrendGraph;