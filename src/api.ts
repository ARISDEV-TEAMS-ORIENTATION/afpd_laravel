const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim();
const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
export const API_BASE_URL = normalizedApiBaseUrl;
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const AUTH_TOKEN_STORAGE_KEY = 'afpd_auth_token';

interface FetchOptions extends RequestInit {
    timeout?: number;
}

export const getAuthToken = (): string => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
};

export const setAuthToken = (token?: string | null) => {
    if (typeof window === 'undefined') return;
    if (!token) {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
};

export const clearAuthToken = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const apiFetch = async (
    endpoint: string,
    options: FetchOptions = {}
): Promise<Response> => {
    const fallbackTimeout = Number.isFinite(API_TIMEOUT_MS) ? API_TIMEOUT_MS : 15000;
    const { timeout = fallbackTimeout, ...fetchOptions } = options;
    const resolvedTimeout =
        Number.isFinite(timeout) && timeout > 0 ? timeout : fallbackTimeout;

    const url = `${API_BASE_URL}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), resolvedTimeout);
    const isFormDataBody =
        typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const authToken = getAuthToken();
    const headers = new Headers(fetchOptions.headers);

    if (!isFormDataBody && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
    }
    if (authToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${authToken}`);
    }

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
            // Utiliser 'same-origin' au lieu de 'include' pour éviter les erreurs CORS
            // Une fois le backend configuré avec CORS strict, passer à 'include'
            credentials: fetchOptions.credentials ?? 'same-origin',
            headers,
        });

        if (!response.ok) {
            let errBody = null;
            try {
                // Lire le texte une seule fois et le parser
                const text = await response.text();
                try {
                    errBody = JSON.parse(text);
                } catch {
                    errBody = { message: text };
                }
            } catch {
                errBody = null;
            }
            const err: any = new Error(
                errBody?.message || `API Error: ${response.status} ${response.statusText}`
            );
            err.status = response.status;
            err.body = errBody;
            throw err;
        }

        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timeout after ${resolvedTimeout}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const apiGet = async (endpoint: string, options?: FetchOptions) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'GET',
    });
    return response.json();
};

export const apiPost = async (
    endpoint: string,
    data?: unknown,
    options?: FetchOptions
) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'POST',
        body: JSON.stringify(data),
    });
    return response.json();
};

export const apiPut = async (
    endpoint: string,
    data?: unknown,
    options?: FetchOptions
) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'PUT',
        body: JSON.stringify(data),
    });
    return response.json();
};

export const apiDelete = async (endpoint: string, options?: FetchOptions) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'DELETE',
    });
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
};

export const apiPostForm = async (
    endpoint: string,
    data: FormData,
    options?: FetchOptions
) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'POST',
        body: data,
    });
    return response.json();
};

export const apiDownload = async (
    endpoint: string,
    options?: FetchOptions
): Promise<Blob> => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: options?.method ?? 'GET',
    });
    return response.blob();
};
