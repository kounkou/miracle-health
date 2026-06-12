export const API = import.meta.env.VITE_API_BASE || "https://miracle-health-729237515205.us-west2.run.app/api/";

export async function apiFetch(path: string, opts: RequestInit = {}) {
    const mergedHeaders = { "Content-Type": "application/json", ...(opts.headers || {}) };
    let res;
    try {
        res = await fetch(`${API}${path}`, {
            headers: mergedHeaders,
            ...opts,
        });
    } catch {
        throw new Error("Cannot reach API server. Make sure the Go backend is running.");
    }

    const contentType = res.headers.get("content-type") || "";
    const isJSON = contentType.includes("application/json");
    const data = isJSON ? await res.json() : null;

    if (!res.ok) {
        const message = data?.error || `Request failed (${res.status})`;
        throw new Error(message);
    }

    return data ?? {};
}
