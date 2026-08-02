//
//  WorkoutHealthManager.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-05.
//

import Foundation
import SwiftUI
import HealthKit

struct WorkoutSample {
    let date: Date
    let activeEnergyBurned: Double
    let durationMinutes: Double
    let averageHeartRate: Double
    let totalEnergyBurned: Double
    let vo2maxMeasured: Double
    let workoutType: String
    let restingHeartRate: Double
}

struct WorkoutPayload: Encodable {
    let date: String
    let activeCalories: Double
    let workoutDuration: Double
    let avgHeartRate: Double
    let kilocalories: Double
    let vo2maxMeasured: Double
    let workoutType: String
    let restingHeartRate: Double
    let localTimezone: String

    var asDictionary: [String: Any] {
        [
            "date": date,
            "activeCalories": activeCalories,
            "workoutDuration": workoutDuration,
            "avgHeartRate": avgHeartRate,
            "kilocalories": kilocalories,
            "vo2maxMeasured": vo2maxMeasured,
            "workoutType": workoutType,
            "restingHeartRate": restingHeartRate,
            "localTimezone": localTimezone
        ]
    }
}

extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .running:
            return "running"
        case .walking:
            return "walking"
        case .cycling:
            return "cycling"
        case .swimming:
            return "swimming"
        case .hiking:
            return "hiking"
        case .highIntensityIntervalTraining:
            return "hiit"
        default:
            return "workout"
        }
    }
}

struct WorkoutHealthManager {
    private let healthStore = HKHealthStore()

    func requestWorkouts(startDate: Date, endDate: Date) async throws -> [WorkoutSample] {
        let typesToRead: Set = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .vo2Max)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!
        ]

        if HKHealthStore.isHealthDataAvailable() {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
        }
        
        // Construct the HealthKit predicate using your given custom date range bounds
        let rangePredicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: endDate,
            options: .strictStartDate
        )

        // Pass the range predicate directly into your shared query architecture function
        return try await fetchRecentWorkouts(predicate: rangePredicate)
    }
    
    func fetchRestingHeartRate(healthStore: HKHealthStore) async throws -> Double? {
        // 1. Define the resting heart rate quantity type
        guard let rhrType = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) else {
            return nil
        }
        
        // 2. Sort by start date descending to get the newest sample first
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        // 3. Request the absolute latest sample across all history (no predicate needed)
        let samples = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKSample], Error>) in
            let query = HKSampleQuery(
                sampleType: rhrType,
                predicate: nil, // Passing nil searches all available HealthKit history
                limit: 1,       // We only need the single newest entry
                sortDescriptors: [sortDescriptor]
            ) { _, results, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: results ?? [])
                }
            }
            healthStore.execute(query)
        }
        
        // 4. Safely extract the sample
        guard let latestSample = samples.first as? HKQuantitySample else {
            print("No resting heart rate records exist in HealthKit.")
            return nil
        }
        
        // 5. Convert the value to Beats Per Minute (BPM)
        let bpmUnit = HKUnit.count().unitDivided(by: .minute())
        return latestSample.quantity.doubleValue(for: bpmUnit)
    }

    private func fetchRecentWorkouts(predicate: NSPredicate? = nil) async throws -> [WorkoutSample] {
        let workoutType = HKObjectType.workoutType()
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        // 1. Fetch the base workouts
        let hkWorkouts = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKWorkout], Error>) in
             let query = HKSampleQuery(sampleType: workoutType, predicate: predicate, limit: 10, sortDescriptors: [sortDescriptor]) { _, samples, error in
                 if let error {
                     continuation.resume(throwing: error)
                     return
                 }
                 continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
             }
             healthStore.execute(query)
         }

        // 2. Fetch the absolute latest known VO2 Max as a global fallback
        // (Assuming you have a helper function for this, or you can adjust 'fetchVO2Max(around: nil)')
        let latestKnownVO2Max = await fetchLatestGlobalVO2Max()

        var mappedWorkouts: [WorkoutSample] = []

        // 3. Loop through each workout
        for workout in hkWorkouts {
            let durationMinutes = workout.duration / 60
            let activeCalories = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0
            let typeName = workout.workoutActivityType.name
            
            let restingCalories = await fetchRestingCalories(for: workout)
            let totalKilocalories = activeCalories + restingCalories
            let avgHeartRate = await fetchAverageHeartRate(for: workout)
            
            // Fetch VO2 Max specifically tied to this workout timeline
            var vo2Max = await fetchVO2Max(around: workout)
            
            // FIX: If this specific workout didn't generate a VO2 Max, fall back to the latest known reading
            if vo2Max <= 0 {
                vo2Max = latestKnownVO2Max
            }
            
            // Safety guard: If they have NEVER recorded a VO2 max in their life, you can choose to skip
            // or just let it pass through with 0.0 so your HIIT workouts show up.
            // guard vo2Max > 0 else { continue }

            let rhr: Double?

            do {
                rhr = try await fetchRestingHeartRate(healthStore: self.healthStore)
                
                let sample = WorkoutSample(
                    date: workout.startDate,
                    activeEnergyBurned: activeCalories,
                    durationMinutes: durationMinutes,
                    averageHeartRate: avgHeartRate,
                    totalEnergyBurned: totalKilocalories,
                    vo2maxMeasured: vo2Max, // Uses workout-specific or latest global fallback
                    workoutType: typeName,
                    restingHeartRate: rhr ?? 0.0
                )
                mappedWorkouts.append(sample)
            } catch {
                print("error occurred")
            }
        }

        return mappedWorkouts
    }

    
    private func fetchRestingCalories(for workout: HKWorkout) async  -> Double {
        guard let restingEnergyType = HKQuantityType.quantityType(forIdentifier: .basalEnergyBurned) else  { return 0 }
        
        let predicate = HKQuery.predicateForSamples(withStart: workout.startDate, end: workout.endDate, options: .strictStartDate)
        
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: restingEnergyType, quantitySamplePredicate: predicate, options: .cumulativeSum) {
                _, statistics, _ in guard let sumQuantity = statistics?.sumQuantity() else {
                    continuation.resume(returning: 0)
                    return
                }
                let kilocalories = sumQuantity.doubleValue(for: .kilocalorie())
                continuation.resume(returning: kilocalories)
            }
            healthStore.execute(query)
        }
    }

    // Helper: Query average heart rate during the exact timeline of the workout
    private func fetchAverageHeartRate(for workout: HKWorkout) async -> Double {
        guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return 0 }

        let predicate = HKQuery.predicateForSamples(withStart: workout.startDate, end: workout.endDate, options: .strictStartDate)

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: heartRateType, quantitySamplePredicate: predicate, options: .discreteAverage) { _, statistics, _ in
                guard let averageQuantity = statistics?.averageQuantity() else {
                    continuation.resume(returning: 0)
                    return
                }
                let beatsPerMinute = averageQuantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                continuation.resume(returning: beatsPerMinute)
            }
            healthStore.execute(query)
        }
    }

    // Helper: Query standalone VO2 Max samples documented around the workout window
    private func fetchVO2Max(around workout: HKWorkout) async -> Double {
        guard let vo2MaxType = HKQuantityType.quantityType(forIdentifier: .vo2Max) else { return 0 }

        // Search window: Look from workout start until 2 hours after completion
        let predicate = HKQuery.predicateForSamples(withStart: workout.startDate, end: workout.endDate.addingTimeInterval(7200), options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: vo2MaxType, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: 0)
                    return
                }
                let vo2Unit = HKUnit(from: "mL/min·kg")
                let rawValue = sample.quantity.doubleValue(for: vo2Unit)
                
                guard rawValue > 0 else {
                    continuation.resume(returning: 0)
                    return
                }
                continuation.resume(returning: rawValue)
            }
            healthStore.execute(query)
        }
    }
    
    private func fetchLatestGlobalVO2Max() async -> Double {
        guard let vo2MaxType = HKObjectType.quantityType(forIdentifier: .vo2Max) else { return 0.0 }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        return await withCheckedContinuation { continuation in
            // Limit 1 and sorted descending gives us the absolute newest reading
            let query = HKSampleQuery(sampleType: vo2MaxType, predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, _ in
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: 0.0)
                    return
                }
                let unit = HKUnit(from: "ml/kg*min")
                continuation.resume(returning: sample.quantity.doubleValue(for: unit))
            }
            healthStore.execute(query)
        }
    }
}

