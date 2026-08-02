//
//  CircularProgressView.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-05.
//

import Foundation
import SwiftUI

struct CircularProgressView: View {
    let progress: Double
    let color: Color

    var body: some View {
        ZStack {
            Circle()
                .stroke(color.opacity(0.18), lineWidth: 10)
            Circle()
                // Divide by 100 to convert a score like 75.0 down to 0.75
                .trim(from: 0, to: progress / 100.0)
                .stroke(color, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 64, height: 64)
    }
}
