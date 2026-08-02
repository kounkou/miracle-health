//
//  SettingsView.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-06.
//

import SwiftUI

struct FullSettingsView: View {
    // Allows this view to dismiss itself back to the dashboard smoothly
    @Environment(\.dismiss) var dismiss
    
    @Binding var isDarkMode: Bool
    @Binding var authToken: String
    @Binding var savedEmail: String
    @Binding var email: String
    @Binding var password: String
    @Binding var forecast: ForecastResponse?
    @Binding var isAuthenticated: Bool
    @Binding var errorMessage: String
    @Binding var isNotificationEnabled: Bool
    
    @State private var workoutStatus = "No workouts collected yet"
    @State private var workoutManager = WorkoutHealthManager()
    @State private var rangeStartDate: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var rangeEndDate: Date = Date()
    @State private var isSubmittingRange = false
    @State private var showSuccessIcon = false
    
    private let apiBaseCandidates = [
        "http://10.0.0.73:8080",
        // "https://miracle-health-729237515205.us-west2.run.app",
        // "http://10.0.0.73",
        // "http://10.0.0.73:3000"
    ]
    
    private struct APIErrorResponse: Decodable {
        let error: String?
        let message: String?
    }

    // Validation parameter: Ensures start date is chronological
    private var isWorkoutRangeValid: Bool {
        rangeStartDate <= rangeEndDate
    }
    
    private func submitWorkoutsFromSettingsRange() {
        guard isWorkoutRangeValid else { return }
        
        withAnimation(.easeInOut) {
            isSubmittingRange = true
            showSuccessIcon = false // Reset any previous success state
            errorMessage = ""
        }
        
        Task {
            do {
                // 1. Fetch the workout samples from HealthKit using your range variables
                let workouts = try await workoutManager.requestWorkouts(startDate: rangeStartDate, endDate: rangeEndDate)
                
                // 2. Early return if nothing was captured within the selected timeframe
                guard !workouts.isEmpty else {
                    await MainActor.run {
                        withAnimation(.easeInOut) {
                            isSubmittingRange = false
                            errorMessage = "No workouts found in the selected range."
                        }
                    }
                    return
                }
                
                // 3. Map the HealthKit array into your database-structured WorkoutPayload objects
                let payloads = workouts.map { workout in
                    WorkoutPayload(
                        date: workout.date.formatted(.iso8601),
                        activeCalories: workout.activeEnergyBurned,
                        workoutDuration: workout.durationMinutes,
                        avgHeartRate: workout.averageHeartRate,
                        kilocalories: workout.totalEnergyBurned,
                        vo2maxMeasured: workout.vo2maxMeasured,
                        workoutType: workout.workoutType,
                        restingHeartRate: workout.restingHeartRate,
                        localTimezone: getLocalTimezone()
                    )
                }
                
                workoutStatus = "Submitting \(payloads.count) workout(s)…"
                try await submitWorkouts(payloads)
                workoutStatus = "Successfully synced \(payloads.count) workout(s)"
                isSubmittingRange = false;
                
                await MainActor.run {
                    withAnimation(.easeInOut) {
                        isSubmittingRange = false
                        showSuccessIcon = true // 1. Show the complete icon
                    }
                }
                
                // 2. Wait for 3 seconds on a background thread without blocking the UI
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                
                // 3. Dismiss the complete icon smoothly
                await MainActor.run {
                    withAnimation(.easeInOut) {
                        showSuccessIcon = false
                    }
                }
                
            } catch {
                print("Failed to bulk sync range workouts: \(error.localizedDescription)")
                await MainActor.run {
                    withAnimation(.easeInOut) {
                        isSubmittingRange = false
                        errorMessage = error.localizedDescription
                    }
                }
            }
        }
    }
    
    private func submitWorkouts(_ payloads: [WorkoutPayload]) async throws {
        for payload in payloads {
            _ = try await performDecodableRequest(
                paths: ["/api/me/workouts", "/api/workouts", "/workouts"],
                method: "POST",
                body: try JSONSerialization.data(withJSONObject: payload.asDictionary),
                token: authToken
            ) as EmptyResponse
        }
    }
    
    func performDecodableRequest<T: Decodable>(paths: [String], method: String, body: Data? = nil, token: String? = nil) async throws -> T {
        var lastError: Error?

        for base in apiBaseCandidates {
            for path in paths {
                let endpoint = base + path
                guard let url = URL(string: endpoint) else { continue }
                var request = URLRequest(url: url)
                request.httpMethod = method
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                if let token {
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
                if let body {
                    request.httpBody = body
                }

                do {
                    let (data, response) = try await URLSession.shared.data(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        throw URLError(.badServerResponse)
                    }

                    if (200..<300).contains(httpResponse.statusCode) {
                        let decoder = JSONDecoder()
                        decoder.keyDecodingStrategy = .useDefaultKeys
                        return try decoder.decode(T.self, from: data)
                    }

                    let message = parseErrorMessage(from: data)
                    lastError = NSError(domain: "Miracle", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
                } catch {
                    lastError = error
                }
            }
        }

        throw lastError ?? URLError(.unknown)
    }
    
    private func parseErrorMessage(from data: Data) -> String {
        if let decoded = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            return decoded.error ?? decoded.message ?? "The request failed."
        }
        return String(data: data, encoding: .utf8) ?? "The request failed."
    }
    
    private func getLocalTimezone() -> String {
        return TimeZone.current.identifier
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    
                    FullSettingsSection(header: "Profile") {
                        NavigationLink(destination: EditProfileView(forecast: $forecast, authToken: $authToken, errorMessage: $errorMessage)) {
                            FullSettingsRow(icon: "person.crop.circle", iconColor: .blue, title: "Edit Profile")
                        }
                    }
                    
                    // 2. Social Section
                    FullSettingsSection(header: "Social") {
                        if let testFlightURL = URL(string: "https://testflight.apple.com/join/abcd") {
                            ShareLink(
                                item: testFlightURL,
                                message: Text("Join me on the Bomoi Health beta app to track your workouts!")
                            ) {
                                FullSettingsRow(
                                    icon: "square.and.arrow.up.fill",
                                    iconColor: .green,
                                    title: "Invite Friends"
                                )
                            }
                        }
                    }
                    
                    // 3. Appearance Section
                    FullSettingsSection(header: "Appearance") {
                        Toggle(isOn: $isDarkMode) {
                            Label(
                                isDarkMode ? "Dark Mode Active" : "Light Mode Active",
                                systemImage: isDarkMode ? "moon.fill" : "sun.max.fill"
                            )
                        }
                        .tint(.blue)
                        // Optional: Animate layout transitions when the toggle switches
                        .animation(.default, value: isDarkMode)
                    }
                    
                    // 4. Notifications Section
                    FullSettingsSection(header: "Notifications") {
                        Toggle(isOn: $isNotificationEnabled) {
                            Label("Allow Notifications", systemImage: "bell.badge.fill")
                        }
                        .tint(.blue)
                    }
                    
                    // 5. Connect Section
                    FullSettingsSection(header: "Connect") {
                        if let whatsappURL = URL(string: "https://chat.whatsapp.com/K7rewzVeWuSJSS9IqyV73h?s=cl&p=i&ilr=2") {
                            Link(destination: whatsappURL) {
                                FullSettingsRow(icon: "bubble.left.and.bubble.right.fill", iconColor: .green, title: "Join Group Chat")
                            }
                        }
                    }
                    
                    FullSettingsSection(header: "Bulk Submit Workouts") {
                        VStack(spacing: 14) {
                            
                            // 1. Start Date Parameter
                            HStack {
                                Image(systemName: "calendar.badge.plus")
                                    .foregroundColor(.blue)
                                Text("From Date")
                                    .font(.body)
                                Spacer()
                                DatePicker("", selection: $rangeStartDate, displayedComponents: .date)
                                    .labelsHidden()
                                    .frame(width: 130, alignment: .trailing)
                                    .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
                            }
                            
                            // 2. End Date Parameter
                            HStack {
                                Image(systemName: "calendar.badge.minus")
                                    .foregroundColor(.blue)
                                Text("To Date")
                                    .font(.body)
                                Spacer()
                                DatePicker("", selection: $rangeEndDate, displayedComponents: .date)
                                    .labelsHidden()
                                    .frame(width: 130, alignment: .trailing)
                                    .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
                            }
                            
                            // 3. Range Verification Alert Node
                            if !isWorkoutRangeValid {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                    Text("Start date must be earlier than end date.")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(8)
                                .background(Color.orange.opacity(0.08))
                                .cornerRadius(8)
                            }
                            
                            Button(action: submitWorkoutsFromSettingsRange) {
                                HStack(spacing: 8) {
                                    if showSuccessIcon {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(.green)
                                            .transition(.scale.combined(with: .opacity))
                                        Text("Sync Complete")
                                            .bold()
                                    } else if isSubmittingRange {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        Text("Submitting...")
                                            .bold()
                                    } else {
                                        Text("Sync Range Workouts")
                                            .bold()
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                // Dynamically shift background colors to green on success for strong physical feedback
                                .background(showSuccessIcon ? Color.green.opacity(0.15) : (isWorkoutRangeValid && !isSubmittingRange ? Color.blue : Color.gray.opacity(0.3)))
                                .foregroundColor(showSuccessIcon ? .green : .white)
                                .cornerRadius(10)
                            }
                            .disabled(!isWorkoutRangeValid || isSubmittingRange || showSuccessIcon)
                        }
                        .padding(.vertical, 4)
                    }

                    
                    FullSettingsSection(header: "Legal") {
                        NavigationLink(destination: DisclaimerView()) {
                            FullSettingsRow(
                                icon: "doc.text.fill",
                                iconColor: .gray,
                                title: "Disclaimer & Terms"
                            )
                        }
                    }
                    
                    // 6. Sign-Out Section
                    FullSettingsSection(header: "Account") {
                        Button {
                            // Clear all active authentication tokens and states
                            authToken = ""
                            savedEmail = ""
                            email = ""
                            password = ""
                            forecast = nil
                            isAuthenticated = false
                            errorMessage = ""
                            
                            // Automatically dismiss the settings sheet overlay after logging out
                            dismiss()
                        } label: {
                            FullSettingsRow(
                                icon: "arrow.left.square.fill",
                                iconColor: .red,
                                title: "Sign Out"
                            )
                        }
                    }
                    
                    // 7. Footer Version Info
                    VStack(spacing: 4) {
                        Text("Bomoi Health v1.0.0")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                        Text("© 2026 Miracle LABS INC. All rights reserved.")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 30)
                    .padding(.bottom, 20)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .preferredColorScheme(isDarkMode ? .dark : .light)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Moves the close button to the top-right corner
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss() // Smoothly dismisses the settings sheet
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: - Helper UI Subviews
struct FullSettingsSection<Content: View>: View {
    let header: String
    let content: Content
    init(header: String, @ViewBuilder content: () -> Content) {
        self.header = header
        self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(header.uppercased()).font(.caption).foregroundColor(.secondary).padding(.leading, 8)
            VStack(spacing: 0) { content }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(16)
        }
    }
}

struct FullSettingsRow: View {
    let icon: String; let iconColor: Color; let title: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundColor(.white).frame(width: 30, height: 30).background(iconColor).cornerRadius(6)
            Text(title).foregroundColor(.primary)
            Spacer()
            Image(systemName: "chevron.right").font(.footnote).foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}
