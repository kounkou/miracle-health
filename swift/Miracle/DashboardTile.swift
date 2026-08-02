//
//  DashboardTitle.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-05.
//

import Foundation
import SwiftUI

struct DashboardTile<Content: View>: View {
    let title: String
    let subtitle: String
    let accent: Color
    let icon: String
    let content: Content

    init(title: String, subtitle: String, accent: Color, icon: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.accent = accent
        self.icon = icon
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            content
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemBackground))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color(UIColor.secondarySystemFill).opacity(1.0), lineWidth: 1)
                )
        )
    }
}
