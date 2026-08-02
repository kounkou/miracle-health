//
//  SparklineView.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-05.
//

import Foundation
import SwiftUI

struct SparklineView: View {
    let values: [Double]
    let color: Color

    var body: some View {
        GeometryReader { geo in
            let maxValue = values.max() ?? 1
            let minValue = values.min() ?? 0
            let range = max(maxValue - minValue, 0.0001)
            let points = values.enumerated().map { index, value -> CGPoint in
                let x = CGFloat(index) / CGFloat(max(values.count - 1, 1)) * geo.size.width
                let normalized = (value - minValue) / range
                let y = geo.size.height - (normalized * geo.size.height)
                return CGPoint(x: x, y: y)
            }

            ZStack {
                // 1. Background Grid Lines
                ForEach([0.0, 0.5, 1.0], id: \.self) { percentage in
                    let yPos = percentage * geo.size.height
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: yPos))
                        path.addLine(to: CGPoint(x: geo.size.width, y: yPos))
                    }
                    .stroke(Color.gray.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                }

                // 2. NEW: Color Accent Background Area (Gradient Fill)
                if !points.isEmpty {
                    Path { path in
                        // Start at the first trend point
                        path.move(to: points.first!)
                        
                        // Trace along the sparkline line
                        for point in points.dropFirst() {
                            path.addLine(to: point)
                        }
                        
                        // Drop straight down to the bottom-right corner of the canvas
                        path.addLine(to: CGPoint(x: points.last!.x, y: geo.size.height))
                        
                        // Slide left across the bottom edge to the bottom-left corner
                        path.addLine(to: CGPoint(x: points.first!.x, y: geo.size.height))
                        
                        // Close the loop back up to the first point
                        path.closeSubpath()
                    }
                    // Fill the closed area with a nice fading gradient top-to-bottom
                    .fill(
                        LinearGradient(
                            colors: [color.opacity(0.25), color.opacity(0.00)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }

                // 3. The Main Sparkline Stroke (Layered on top of the accent fill)
                Path { path in
                    guard let first = points.first else { return }
                    path.move(to: first)
                    for point in points.dropFirst() {
                        path.addLine(to: point)
                    }
                }
                .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(height: 60)
    }
}
