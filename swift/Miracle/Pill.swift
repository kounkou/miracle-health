//
//  Pill.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-05.
//

import Foundation
import SwiftUI

struct Pill: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1) // Prevents wrapping text from distorting height
            Text(value)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        // 1. Force the inner view content container to match sizes
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemFill))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
