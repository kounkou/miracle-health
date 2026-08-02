//
//  ContentView.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-01.
//

import SwiftUI
import HealthKit

struct ContentView: View {
    @AppStorage("miracle_auth_token") private var authToken: String = ""
    @AppStorage("miracle_user_email") private var savedEmail: String = ""
    @AppStorage("isDarkMode") private var isDarkMode: Bool = false
    @AppStorage("isNotificationEnabled") private var isNotificationEnabled: Bool = true

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var forecast: ForecastResponse? = nil
    @State private var isAuthenticated = false
    @State private var workoutStatus = "No workouts collected yet"
    @State private var isSubmittingWorkout = false
    @State private var healthStore = HKHealthStore()
    @State private var workoutManager = WorkoutHealthManager()
    @State private var workoutObserver: HKObserverQuery?
    @State private var isFetching = false
    @State private var isShowingFullSettings = false
    
    @State private var rangeStartDate: Date = Calendar.current.startOfDay(for: Date())
    @State private var rangeEndDate: Date = Date()
    
    // Inject this line at the top level of your View struct
    @Environment(\.scenePhase) private var scenePhase
    
    private func startWorkoutObserver() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        
        let workoutType = HKObjectType.workoutType()
        
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { _, completionHandler, error in
            DispatchQueue.main.async {
                Task { @MainActor in
                    await self.syncWorkouts()
                }
            }
            completionHandler()
        }
        
        healthStore.execute(query)
        
        self.workoutObserver = query
    }

    private let appVersion: String = {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
            ?? "0.0.11"
    }()

    private let apiBaseCandidates = [
        "http://10.0.0.73:8080",
        // "https://miracle-health-729237515205.us-west2.run.app",
        // "http://10.0.0.73",
        // "http://10.0.0.73:3000"
    ]

    var body: some View {
        Group {
            if isAuthenticated || !authToken.isEmpty {
                dashboardView
            } else {
                loginView
            }
        }
        .preferredColorScheme(isDarkMode ? .dark : .light)
        .onAppear {
            if !authToken.isEmpty {
                isAuthenticated = true
                Task { await loadForecast() }
            }
            
            startWorkoutObserver()
            NotificationManager.shared.requestAuthorization()
        }
        
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .background {
                if let currentForecast = forecast {
                    let completedZone1Value = Double(currentForecast.zone1Completed)
                    let completedZone2Value = Double(currentForecast.zone2Completed)
                    let neededZone1 = String(currentForecast.nextWalkDisplay)
                    let neededZone2 = String(currentForecast.nextRunDisplay)
                    
                    if isNotificationEnabled && (completedZone1Value < 50.0 || completedZone2Value < 50.0) {
                        // Pass the variable directly into the updated method
                        NotificationManager.shared.scheduleWorkoutReminder(neededZone1, neededZone2, completedZone1Value, completedZone2Value)
                    }
                }
            }
        }
        
        .refreshable {
            await handleManualRefresh()
        }
    }
    
    private func handleManualRefresh() async {
        do {
            print("🔄 Pull-to-refresh triggered manually by user.")
            
            // 1. Re-fetch your network API forecast data
            // Assuming you store your auth token safely somewhere
            let token = authToken
            let freshForecast = try await fetchForecast(token: token)
            
            // 2. Update your state variables safely on the Main Actor
            await MainActor.run {
                self.forecast = freshForecast
            }
            
        } catch {
            print("❌ Manual refresh task failed: \(error.localizedDescription)")
        }
    }

    private var loginView: some View {
        NavigationStack {
            VStack(spacing: 20) {
                VStack(spacing: 8) {
                    Image(systemName: "heart.text.square.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.blue)
                    Text("Bomoi Health")
                        .font(.title3.weight(.bold))
                    Text("Sign in to view your readiness, fitness and recovery insights.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    SecureField("Password", text: $password)
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task { await signIn() }
                    } label: {
                        HStack {
                            if isLoading {
                                ProgressView()
                            } else {
                                Text("Sign in")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.blue)
                    .disabled(isLoading)
                }
                .padding(.horizontal, 24)
            }
            .padding()
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Login")
        }
    }

    private var dashboardView: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 16)
                ], spacing: 16) {
                    DashboardTile(
                        title: "Cardio Fitness",
                        subtitle: "Your VO₂ max measured in mL/kg/min",
                        accent: .blue,
                        icon: ""
                    ) {
                        VStack(alignment: .leading, spacing: 12) { // Increased spacing for the banner
                            VStack(alignment: .leading, spacing: 8) {
                                Text("VO₂ max")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                
                                HStack(spacing: 8) {
                                    Text(forecast?.cardioValueText ?? "—")
                                        .font(.title3.weight(.bold))
                                    Text(forecast?.cardioFitnessClassText ?? "Pending")
                                        .font(.caption.weight(.semibold))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.blue.opacity(0.16))
                                        .clipShape(Capsule())
                                }
                            }
                            
                            if forecast?.dob == "" || forecast?.sex == "" {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.circle.fill")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                    
                                    Text("Complete your profile in Settings to compute your classification correctly.")
                                        .font(.caption2)
                                        .fontWeight(.medium)
                                        .foregroundColor(.secondary)
                                        .lineLimit(2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.orange.opacity(0.08))
                                .cornerRadius(16)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(Color.orange.opacity(0.2), lineWidth: 1.0)
                                )
                                .transition(.opacity)
                            }

                            SparklineView(values: forecast?.chartValues ?? [], color: .blue)

                            HStack(spacing: 8) {
                                Pill(label: "Next HIIT", value: forecast?.nextHiitDisplay ?? "—")
                                Pill(label: "Next Run", value: forecast?.nextRunDisplay ?? "—")
                                Pill(label: "Next Walk", value: forecast?.nextWalkDisplay ?? "—")
                            }
                        }
                    }
                    
                    DashboardTile(
                        title: "Systemic readiness",
                        subtitle: forecast?.readinessSubtitle ?? "Adaptive accumulation window",
                        accent: .blue,
                        icon: ""
                    ) {
                        HStack(alignment: .center, spacing: 12) {
                            CircularProgressView(progress: Double(forecast?.score ?? 0), color: .blue)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(forecast?.readinessPercentText ?? "—")
                                    .font(.title3.weight(.bold))
                                Text(forecast?.readinessMessage ?? "—")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    DashboardTile(
                        title: "Running advice",
                        subtitle: "Aerobic threshold, nasal breathing, and sustained fat oxidation",
                        accent: .blue,
                        icon: ""
                    ) {
                        HStack(alignment: .center, spacing: 12) {
                            CircularProgressView(progress: Double(forecast?.zone2Completed ?? 0), color: .blue)
                            
                            VStack(alignment: .leading, spacing: 6) {
                                Text(forecast?.zone2PercentText ?? "—")
                                    .font(.title3.weight(.bold))
                                
                                Text(forecast?.runningAdvice ?? "—")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    DashboardTile(
                        title: "Walking advice",
                        subtitle: "Pace, distance, and low-intensity aerobic volume",
                        accent: .blue,
                        icon: ""
                    ) {
                        HStack(alignment: .center, spacing: 12) {
                            CircularProgressView(progress: Double(forecast?.zone1Completed ?? 0), color: .blue)
                            
                            VStack(alignment: .leading, spacing: 6) {
                                Text(forecast?.zone1PercentText ?? "—")
                                    .font(.title3.weight(.bold))
                                
                                Text(forecast?.walkingAdvice ?? "—")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    DashboardTile(
                        title: "Fitness",
                        subtitle: "Your long-term aerobic baseline",
                        accent: .blue,
                        icon: ""
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Fitness gain")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
//                            HStack(spacing: 8) {
                                Text(forecast?.fitnessValueText ?? "—")
                                    .font(.title3.weight(.bold))
                                
//                                Text(forecast?.fitnessClassMessage ?? "Pending")
//                                    .font(.caption.weight(.semibold))
//                                    .padding(.horizontal, 8)
//                                    .padding(.vertical, 4)
//                                    .background(Color.blue.opacity(0.16))
//                                    .clipShape(Capsule())
//                            }
                            
                            SparklineView(values: forecast?.fitnessSeries ?? [], color: .blue)
                            
                            HStack(spacing: 8) {
                                Pill(
                                    label: "Decay",
                                    value: forecast?.phaseBoundaries?.supercompEnd?.formatted(
                                    .number.precision(.fractionLength(2)).locale(Locale(identifier: "en_US"))
                                ) ?? "N/A")
                                Pill(
                                    label: "Error",
                                    value: forecast?.rmse1?.formatted(
                                        .number.precision(.fractionLength(2)).locale(Locale(identifier: "en_US"))
                                    ) ?? "N/A"
                                )
                            }
                        }
                    }

                    DashboardTile(
                        title: "Fatigue",
                        subtitle: "The cost of your recent efforts",
                        accent: .blue,
                        icon: ""
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Fatigue gain")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
//                            HStack(spacing: 8) {
                                Text(forecast?.fatigueValueText ?? "—")
                                    .font(.title3.weight(.bold))
                                
//                                Text(forecast?.fatigueClassMessage ?? "Pending")
//                                    .font(.caption.weight(.semibold))
//                                    .padding(.horizontal, 8)
//                                    .padding(.vertical, 4)
//                                    .background(Color.blue.opacity(0.16))
//                                    .clipShape(Capsule())
//                            }
                    
                            SparklineView(values: forecast?.fatigueSeries ?? [], color: .blue)
                            
                            HStack(spacing: 8) {
                                Pill(
                                    label: "Decay",
                                    value: forecast?.phaseBoundaries?.recoveryEnd?.formatted(
                                    .number.precision(.fractionLength(2)).locale(Locale(identifier: "en_US"))
                                ) ?? "N/A")
                                Pill(
                                    label: "Error",
                                    value: forecast?.rmse2?.formatted(
                                        .number.precision(.fractionLength(2)).locale(Locale(identifier: "en_US"))
                                    ) ?? "N/A"
                                )
                            }
                        }
                    }
                    .gridCellColumns(2)
                }
                .padding()
            }
            // Inside your main dashboard hierarchy:
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Bomoi Health")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingFullSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .imageScale(.large)
                    }
                }
            }
            // Use a sheet to enable the native swipe-down dismissal feature
            .sheet(isPresented: $isShowingFullSettings) {
                FullSettingsView(
                    isDarkMode: $isDarkMode, 
                    authToken: $authToken,
                    savedEmail: $savedEmail,
                    email: $email,
                    password: $password,
                    forecast: $forecast,
                    isAuthenticated: $isAuthenticated,
                    errorMessage: $errorMessage,
                    isNotificationEnabled: $isNotificationEnabled
                )
                .presentationDragIndicator(.visible) // Adds the top grab bar handle
                .presentationCornerRadius(24)        // Gives a premium rounded look
            }
        }
    }

    private func signIn() async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Please enter your email and password."
            return
        }

        isLoading = true
        errorMessage = ""

        do {
            let token = try await authenticate(email: email, password: password)
            authToken = token
            savedEmail = email
            isAuthenticated = true
            await loadForecast()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    private func loadForecast() async {
        guard !authToken.isEmpty else { return }
        isLoading = true
        do {
            forecast = try await fetchForecast(token: authToken)
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func syncWorkouts() async {
        guard !authToken.isEmpty else {
            workoutStatus = "Please sign in before syncing workouts"
            return
        }

        isSubmittingWorkout = true
        workoutStatus = "Requesting HealthKit access…"

        do {
            // 1. Pass your selected range bounds directly into your updated HealthKit query method
            // Note: Ensure your parameters match the signature names (e.g., startDate: / endDate:)
            let workouts = try await workoutManager.requestWorkouts(startDate: rangeStartDate, endDate: rangeEndDate)
            
            guard !workouts.isEmpty else {
                workoutStatus = "No workouts found in the selected range"
                isSubmittingWorkout = false
                return
            }

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
        } catch {
            workoutStatus = "Workout sync failed: \(error.localizedDescription)"
        }

        isSubmittingWorkout = false
    }
    
    private func getLocalTimezone() -> String {
        return TimeZone.current.identifier
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

    private func authenticate(email: String, password: String) async throws -> String {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        let response: LoginResponse = try await performDecodableRequest(
            paths: ["/api/login", "/login"],
            method: "POST",
            body: body
        )
        guard let token = response.token, !token.isEmpty else {
            throw NSError(domain: "Miracle", code: 401, userInfo: [NSLocalizedDescriptionKey: "No token received from the server."])
        }
        return token
    }

    private func fetchForecast(token: String) async throws -> ForecastResponse {
        let localTimezoneIdentifier = TimeZone.current.identifier
        
        let payload: [String: Any] = [
            "healthInputs": ["dob": "", "sex": "male"],
            "trainingMode": "Maintenance",
            "localTimezone": localTimezoneIdentifier
        ]
        let response: ForecastResponse = try await performDecodableRequest(
            paths: ["/api/me/forecast", "/api/me/forecast/", "/me/forecast", "/me/forecast/"],
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: payload),
            token: token
        )
        return response
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
}

struct EmptyResponse: Decodable {}

private struct LoginResponse: Decodable {
    let token: String?
    let email: String?
    let expiresAt: String?
    let isAdmin: Bool?
}

private struct APIErrorResponse: Decodable {
    let error: String?
    let message: String?
}

struct ForecastResponse: Decodable {
    let peakVo2: Double?
    let peakDay: Double?
    let nextHiitDay: Double?
    let nextZone2Day: Double?
    let nextZone1Day: Double?
    let error: String?
    let points: [ForecastPoint]?
    let modelSignals: ModelSignals?
    let readinessScore: Double?
    let cardioFitnessClass: String?
    let completedTodayZone1: Double?
    let completedTodayZone2: Double?
    let rmse1: Double?
    let rmse2: Double?
    let phaseBoundaries: PhaseBoundaries?
    let fitnessClass: String?
    let fatigueClass: String?
    let firstName: String?
    let username: String?
    let dob: String?
    let sex: String?
    
    var zone1Completed: Double {
        return completedTodayZone1 ?? 0.0
    }
    
    var zone2Completed: Double {
        return completedTodayZone2 ?? 0.0
    }
    
    var completedTodayZone1Text: String {
        if let completedTodayZone1{
            return String(format: "%.2f", completedTodayZone1)
        }
        return "-"
    }
    
    var completedTodayZone2Text: String {
        if let completedTodayZone2{
            return String(format: "%.2f", completedTodayZone2)
        }
        return "-"
    }
    
    var cardioFitnessClassText: String {
        return String(cardioFitnessClass ?? "Pending")
    }

    var cardioValueText: String {
        if let peakVo2 {
            return String(format: "%.2f", peakVo2)
        }
        if let point = points?.last(where: { $0.actual != nil }), let actual = point.actual {
            return String(format: "%.2f", actual)
        }
        return "—"
    }

    var chartValues: [Double] {
        let values = (points ?? []).compactMap { $0.actual }
        return values.isEmpty ? [] : values
    }

    var fitnessValueText: String {
        if let last = points?.last(where: { $0.fitnessSignal != nil }), let value = last.fitnessSignal {
            return String(format: "%.3f", value)
        }
        if let k1 = modelSignals?.k1 {
            return String(format: "%.3f", k1)
        }
        return "—"
    }

    var fatigueValueText: String {
        if let last = points?.last(where: { $0.fatigueSignal != nil }), let value = last.fatigueSignal {
            return String(format: "%.3f", value)
        }
        if let k2 = modelSignals?.k2 {
            return String(format: "%.3f", k2)
        }
        return "—"
    }

    var fitnessSeries: [Double] {
        let values = (points ?? []).compactMap { $0.fitnessSignal }
        return values.isEmpty ? [] : values
    }

    var fatigueSeries: [Double] {
        let values = (points ?? []).compactMap { $0.fatigueSignal }
        return values.isEmpty ? [] : values
    }

    var nextHiitDisplay: String {
        guard let nextHiitDay else { return "—" }
        return formatDayOffset(nextHiitDay)
    }

    var nextRunDisplay: String {
        guard let nextZone2Day else { return "—" }
        return formatDayOffset(nextZone2Day)
    }

    var nextWalkDisplay: String {
        guard let nextZone1Day else { return "—" }
        return formatDayOffset(nextZone1Day)
    }

    var fatigueSummary: String {
        let fatigue = fatigueValueText
        return fatigue == "—" ? "Loading" : "Response suggests \(fatigue) residual fatigue"
    }

    var readinessSubtitle: String {
        return "Your body's capacity for stress today"
    }

    var score: Double {
        return readinessScore ?? 0.0
    }

    var readinessPercentText: String {
        let percent = Int(readinessScore ?? 0)
        return "\(percent)%"
    }
    
    var zone1PercentText: String {
        return String(format: "%.1f%%", zone1Completed)
    }
    
    var zone2PercentText: String {
        return String(format: "%.1f%%", zone2Completed)
    }
    
    var fitnessClassMessage: String {
        switch fitnessClass ?? "" {
        case "Peak":
            return "Highest historical capacity"
        case "Optimal":
            return "Highly adapted"
        case "Baseline":
            return "Normal maintenance state"
        case "Detraining":
            return "Losing conditioning"
        case "Atrophied":
            return "Complete loss of adaptation"
        default:
            return "Unknown state" // Handles nil or any unmapped string
        }
    }
    
    var fatigueClassMessage: String {
        switch fatigueClass ?? "" {
        case "Exhausted":
            return "Severe overreaching risk"
        case "Heavy":
            return "Solid training stimulus applied"
        case "Fresh":
            return "Fully recovered status"
        case "Restorated":
            return "High readiness for hard effort"
        case "Dorman":
            return "Inactive or detrained"
        default:
            return "Unknown state" // Handles nul or any unmapped string
        }
    }

    var readinessMessage: String {
        // Safely unwrap the optional score; default to 0 if nil
        switch readinessScore ?? 0 {
        case 76...:
            return "Your neuromuscular pathways are fully fresh. Today is the perfect time for high velocity or explosive workouts like HIIT or a race simulation."
        case 51...75:
            return "Your system is absorbing recent stress. Your body is ready for steady state cardiovascular volume (Zone 2 runs or cycling), but explosive intervals (HIIT) should be delayed."
        case 26...50:
            return "Significant residual fatigue is present. Avoid structural muscle damage. Keep activity restricted strictly to low intensity Zone 1 active recovery walks to help flush metabolic waste."
        default:
            return "Extreme acute training stress has overwhelmed your baseline adaptations. High risk of neural burnout or soft-tissue injury. Commit to a full passive rest day today."
        }
    }

    private func advice(for progress: Double?, zone: String, nextZoneDay: Double?) -> String {
        if Double(nextZoneDay ?? 0) > 0.0 {
            return "You're all caught up on your \(zone) targets for today!"
        }
        
        switch progress ?? 0 {
        case 100...:
            return "You've crushed your target today, amazing work!"
        case 80...99:
            return "Almost there! Just a final push to hit your goal!"
        case 50...79:
            return "You're over halfway there, keep up this great momentum!"
        case 25...49:
            return "Good progress! You're building a solid foundation today."
        case 1...24:
            return "You've just started, every minute counts!"
        default:
            return "You haven't logged any \(zone) time today, let's get moving!"
        }
    }

    var runningAdvice: String {
        return advice(for: completedTodayZone2, zone: "zone 2", nextZoneDay: nextZone2Day)
    }

    var walkingAdvice: String {
        return advice(for: completedTodayZone1, zone: "zone 1", nextZoneDay: nextZone1Day)
    }

    private func formatDayOffset(_ days: Double) -> String {
        let rounded = Int(round(days))
        if rounded == 0 { return "Today" }
        if rounded == 1 { return "Tomorrow" }
        if rounded < 0 { return "Overdue" }
        return "In \(rounded) days"
    }
}

struct ForecastPoint: Decodable {
    let actual: Double?
    let fitnessSignal: Double?
    let fatigueSignal: Double?
    let workoutTypeLabel: String?
    let fitnessClass: String?
    let fatigueClass: String?
}

struct ModelSignals: Decodable {
    let k1: Double?
    let k2: Double?
    let tau1: Double?
    let tau2: Double?
}

struct PhaseBoundaries: Decodable {
    let fatigueEnd: Double?
    let recoveryEnd: Double?
    let supercompEnd: Double?
}

#Preview {
    ContentView()
}
