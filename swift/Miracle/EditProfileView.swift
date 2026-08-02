//
//  EditProfileView.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-06.
//

import Foundation
import SwiftUI
import PhotosUI

struct EditProfileView: View {
    @Environment(\.dismiss) var dismiss
    
    @Binding var forecast: ForecastResponse?
    
    // Form Inputs State
    @State private var firstName: String
    @State private var username: String
    @State private var dateOfBirth: Date
    @State private var selectedSex: String
    
    // Media Selector State
    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var profileImage: Image? = nil
    
    @State private var showErrorAlert = false
    @State private var hasAttemptedSubmit = false
    
    @Binding var authToken: String
    @Binding var errorMessage: String
    
    let sexOptions = ["Male", "Female"]
    
    init(forecast: Binding<ForecastResponse?>, authToken: Binding<String>, errorMessage: Binding<String>) {
        // 1. Initialize all @Binding structural properties first using underscores
        self._forecast = forecast
        self._authToken = authToken
        self._errorMessage = errorMessage
        
        // 2. Extract a snapshot of the current forecast value safely to populate local @State
        let forecastSnapshot = forecast.wrappedValue
        
        // 3. Assign local State wrappers using the current value snapshot
        _firstName = State(initialValue: forecastSnapshot?.firstName ?? "")
        _username = State(initialValue: forecastSnapshot?.username ?? "")
        _selectedSex = State(initialValue: forecastSnapshot?.sex ?? "Not Specified")
        
        // 4. Parse the date string safely
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        
        let parsedDate = forecastSnapshot?.dob.flatMap { formatter.date(from: $0) } ?? Date()
            _dateOfBirth = State(initialValue: parsedDate)
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                
                // 1. Header Profile Photo Section (Classic Standard Style)
                VStack(spacing: 8) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Group {
                            if let profileImage {
                                profileImage
                                    .resizable()
                                    .scaledToFill()
                            } else {
                                // Default classic gray avatar circle
                                Image(systemName: "person.circle.fill")
                                    .resizable()
                                    .foregroundColor(Color(.systemGray4))
                            }
                        }
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                    }
                    
                    /*
                    Button("Edit") {
                        // Triggers the photos picker programmatically if needed
                    }
                     */
                    .font(.subheadline)
                    .foregroundColor(.blue)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
                .background(Color(.systemGroupedBackground)) // Seamless header matching
                
                // 2. Classic Form Content Groups
                Form {
                    Section(header: Text("Public Profile")) {
                        HStack {
                            Text("First Name")
                                .frame(width: 100, alignment: .leading)
                            TextField("Required", text: $firstName)
                                .textContentType(.givenName)
                                .padding(.horizontal, 4) // Prevents text clipping
                                .frame(height: 36)       // Gives native touch sizing
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        // Checks specific variable: firstName
                                        .stroke(Color.red, lineWidth: (hasAttemptedSubmit && firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) ? 0.5 : 0)
                                )
                        }
                        
                        HStack {
                            Text("Username")
                                .frame(width: 100, alignment: .leading)
                            TextField("Required", text: $username)
                                .textContentType(.username)
                                .autocapitalization(.none)
                                .disableAutocorrection(true)
                                .padding(.horizontal, 4)
                                .frame(height: 36)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        // Checks specific variable: username
                                        .stroke(Color.red, lineWidth: (hasAttemptedSubmit && username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) ? 0.5 : 0)
                                )
                        }
                    }
                    
                    Section(header: Text("Private Information")) {
                        DatePicker("Date of Birth", selection: $dateOfBirth, displayedComponents: .date)
                        
                        Picker("Sex", selection: $selectedSex) {
                            ForEach(sexOptions, id: \.self) { option in
                                Text(option).tag(option)
                            }
                        }
                        .pickerStyle(.navigationLink) // Classic nested sliding list layout
                    }
                }
            }
            .padding(.horizontal, 8)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        saveProfileDetails()
                    }
                    .fontWeight(.semibold)
                }
            }
            // Updates profile photo layout dynamically on unwrap
            .onChange(of: pickerItem) { oldValue, newItem in
                Task {
                    if let data = try? await newItem?.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: data) {
                        profileImage = Image(uiImage: uiImage)
                    }
                }
            }
        }
    }
    
    private func saveProfileDetails() {
        // 1. Force immediate UI redraw on the main thread
        withAnimation(.easeInOut) {
            hasAttemptedSubmit = true
        }
        
        // 2. Client-side guard check: Block execution if fields are empty
        guard !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            print("Submission blocked: Empty fields highlighted in red.")
            return
        }
        
        // 1. Wrap the async call in a Task to run smoothly from the button action
        Task {
            do {
                let formatter = ISO8601DateFormatter()
                            formatter.formatOptions = [.withFullDate]
                            formatter.timeZone = TimeZone(secondsFromGMT: 0)
                
                let formattedDob = formatter.string(from: dateOfBirth)
                
                let finalSex = selectedSex == "Not Specified" ? "Male" : selectedSex
                
                // 3. Construct the body dictionary payload matching your server's expected profile fields
                let profilePayload: [String: Any] = [
                    "first_name": firstName,
                    "username": username,
                    "dob": formattedDob,
                    "sex": finalSex
                ]
                
                // 4. Dispatch the call using your shared performDecodableRequest architecture
                _ = try await NetworkManager.shared.performDecodableRequest(
                    paths: ["/api/me/profile", "/api/profile", "/profile"], // Adjust paths if your profile endpoint differs
                    method: "POST",
                    body: try JSONSerialization.data(withJSONObject: profilePayload),
                    token: authToken
                ) as EmptyResponse
                
                // 5. Explicitly jump back to the main UI thread to close out the sheet on success
                await MainActor.run {
                    dismiss()
                }
                
            } catch {
                // 6. Safely handle and trace errors using your state container
                print("Failed to sync profile update parameters: \(error.localizedDescription)")
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}
