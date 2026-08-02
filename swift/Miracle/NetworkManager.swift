//
//  NetworkManager.swift
//  Miracle
//
//  Created by Jacques Kounkou on 2026-08-07.
//

import Foundation

class NetworkManager {
    static let shared = NetworkManager()
    
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
