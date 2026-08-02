//
//  JustifyText.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-07.
//

import Foundation
import SwiftUI

struct JustifiedText: UIViewRepresentable {
    var text: String
    
    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.textAlignment = .justified
        textView.backgroundColor = .clear
        textView.isEditable = false
        textView.isSelectable = false
        textView.isScrollEnabled = false
        
        // Remove padding so it lines up with standard layouts
        textView.textContainer.lineFragmentPadding = 0
        textView.textContainerInset = .zero
        
        // Apply systemic font hierarchy styling
        textView.font = .preferredFont(forTextStyle: .subheadline)
        textView.textColor = .secondaryLabel
        
        // Allow text to compress horizontally and push vertically into wrap-text layout
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return textView
    }
    
    func updateUIView(_ uiView: UITextView, context: Context) {
        uiView.text = text
    }
    
    // Core Layout Fix: Translates bounding boundaries between SwiftUI & UIKit
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? UIScreen.main.bounds.width
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: size.height)
    }
}
