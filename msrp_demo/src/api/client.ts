import axios, { AxiosHeaders, AxiosInstance, AxiosRequestConfig } from 'axios'

// Backend base URL. All routes documented under
// https://wbi.voicenter.co/api/v1/... require a Voicenter Login JWT.
export const API_BASE_URL = 'https://wbi.voicenter.co/api/v1'
export const API_ORIGIN = 'https://wbi.voicenter.co'

// Module-scoped token cache. `setApiToken(null)` clears it. The value is
// injected into every outgoing request via the interceptor below.
let apiToken: string | null = null

export function setApiToken (token: string | null | undefined): void {
    apiToken = token ? token.trim() : null
}

export function getApiToken (): string | null {
    return apiToken
}

export function hasApiToken (): boolean {
    return !!apiToken
}

// Single shared axios instance. Individual endpoint modules import this
// instance instead of constructing their own so token / interceptor
// changes propagate everywhere.
export const apiClient: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000
})

apiClient.interceptors.request.use((config) => {
    if (apiToken) {
        const headers = AxiosHeaders.from(config.headers)
        headers.set('Authorization', `Bearer ${apiToken}`)
        config.headers = headers
    }
    return config
})

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        // Preserve the raw axios error but surface backend `{ error }`
        // envelopes as the primary error message so demo UI can render
        // something readable.
        const payload = error?.response?.data
        if (payload && typeof payload === 'object') {
            const backendMessage =
                (typeof payload.error === 'string' && payload.error) ||
                (typeof payload.message === 'string' && payload.message) ||
                null
            if (backendMessage) {
                error.message = backendMessage
            }
        }
        return Promise.reject(error)
    }
)

/**
 * Build an absolute URL to an API path. Handy for OAuth popup URLs that
 * must be handed off to `window.open()` rather than fetched via axios
 * (e.g. Meta provisioning).
 */
export function buildApiUrl (path: string, queryParams?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${API_BASE_URL}${cleanPath}`)
    if (queryParams) {
        Object.entries(queryParams).forEach(([ key, value ]) => {
            if (value === undefined || value === null) return
            url.searchParams.set(key, String(value))
        })
    }
    return url.toString()
}

/**
 * Small helper for endpoint modules to standardize their call sites.
 * Returns `response.data` unwrapped and typed.
 */
export async function apiGet<T> (url: string, config?: AxiosRequestConfig): Promise<T> {
    const { data } = await apiClient.get<T>(url, config)
    return data
}

export async function apiPost<T> (url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const { data } = await apiClient.post<T>(url, body, config)
    return data
}

export async function apiDelete<T> (url: string, config?: AxiosRequestConfig): Promise<T> {
    const { data } = await apiClient.delete<T>(url, config)
    return data
}
