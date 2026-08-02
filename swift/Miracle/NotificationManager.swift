//
//  NotificationManager.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-06.
//

import Foundation
import UserNotifications

class NotificationManager {
    static let shared = NotificationManager()
    
    // Request notification clearance from the system
    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
        }
    }
    
    // Stage the workout nudge notification
    func scheduleWorkoutReminder(_ neededZone1: String, _ neededZone2: String, _ completedZone1Value: Double, _ completedZone2Value: Double) {
        // Cancel any pending workout alerts so you don't duplicate reminders
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["workout_nudge"])
        
        // Define target metrics (Example: 100% completion is 1.0)
        let workoutGoal = 100.0
        
        // 1. First, check if any workout zone is actually needed today.
        let isZone1Needed = (neededZone1 == "Today")
        let isZone2Needed = (neededZone2 == "Today")
        
        // 2. Early exit logic based on whether the needed zones are already achieved.
        // If a zone is needed, it must be incomplete to proceed. If it's not needed, we ignore its completion status.
        let isZone1Satisfied = !isZone1Needed || completedZone1Value >= workoutGoal
        let isZone2Satisfied = !isZone2Needed || completedZone2Value >= workoutGoal
        
        if isZone1Satisfied && isZone2Satisfied {
            return // Exit early because no needed workouts remain incomplete today
        }
        
        let content = UNMutableNotificationContent()
        content.title = "Time to get moving!"
        content.sound = .default
        
        // 3. Dynamically adjust the body message for the remaining incomplete needed workouts
        if isZone1Needed && completedZone1Value < workoutGoal {
            let percentString = String(format: "%.0f%%", completedZone1Value)
            content.body = "You are only at \(percentString) of your Zone 1 walking goal. Let's get a quick session in!"
        } else if isZone2Needed && completedZone2Value < workoutGoal {
            let percentString = String(format: "%.0f%%", completedZone2Value)
            content.body = "Zone 1 done, but you are only at \(percentString) of your Zone 2 goal. Time to pick up the pace!"
        } else {
            content.body = "Let's squeeze in a quick workout session before the end of the day!"
        }
        
        // Triggers 5 seconds after entering the background
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let request = UNNotificationRequest(identifier: "workout_nudge", content: content, trigger: trigger)
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Failed to schedule notification: \(error.localizedDescription)")
            }
        }
    }

}
