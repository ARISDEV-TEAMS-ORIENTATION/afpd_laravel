const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim();
const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
export const API_BASE_URL = normalizedApiBaseUrl;
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const AUTH_TOKEN_STORAGE_KEY = 'afpd_auth_token';

interface FetchOptions extends RequestInit {
    timeout?: number;
}

export interface ApiError extends Error {
    status?: number;
    body?: any;
    validationErrors?: string[];
    serverMessage?: string;
}

const normalizeText = (value: unknown) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const extractValidationMessages = (body: any): string[] => {
    if (!body || typeof body !== 'object') return [];
    const errors = body?.errors;
    if (!errors || typeof errors !== 'object') return [];

    const messages: string[] = [];
    Object.values(errors).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (typeof item === 'string' && item.trim()) messages.push(item.trim());
            });
            return;
        }
        if (typeof value === 'string' && value.trim()) {
            messages.push(value.trim());
        }
    });
    return messages;
};

const extractServerMessage = (body: any): string => {
    if (!body) return '';
    if (typeof body === 'string') return body.trim();
    if (typeof body?.message === 'string') return body.message.trim();
    if (typeof body?.error === 'string') return body.error.trim();
    if (typeof body?.detail === 'string') return body.detail.trim();
    return '';
};

const isEmailAlreadyUsed = (text: string) => {
    const normalized = normalizeText(text);
    const hasEmail = normalized.includes('email');
    const isDuplicate =
        normalized.includes('already')
        || normalized.includes('deja')
        || normalized.includes('existe')
        || normalized.includes('unique')
        || normalized.includes('duplicate')
        || normalized.includes('taken')
        || normalized.includes('23000')
        || normalized.includes('1062');
    return hasEmail && isDuplicate;
};

const isDatabaseIssue = (text: string) => {
    const normalized = normalizeText(text);
    return (
        normalized.includes('sqlstate')
        || normalized.includes('database')
        || normalized.includes('mysql')
        || normalized.includes('mariadb')
        || normalized.includes('pdoexception')
        || normalized.includes('connection refused')
        || normalized.includes('could not connect')
    );
};

const buildFriendlyErrorMessage = (
    status: number,
    serverMessage: string,
    validationMessages: string[]
) => {
    if (validationMessages.length > 0) {
        const firstMessage = validationMessages[0];
        if (isEmailAlreadyUsed(firstMessage)) {
            return "Cette adresse e-mail est deja utilisee.";
        }
        return firstMessage;
    }

    if (isEmailAlreadyUsed(serverMessage)) {
        return "Cette adresse e-mail est deja utilisee.";
    }

    if (status === 400) return 'Requete invalide. Verifiez les informations saisies.';
    if (status === 401) return 'Identifiants invalides ou session expiree.';
    if (status === 403) return "Vous n'avez pas les droits pour cette action.";
    if (status === 404) return 'Ressource introuvable.';
    if (status === 409) return 'Conflit detecte. Donnee deja existante ou deja modifiee.';
    if (status === 419) return 'Session expiree. Veuillez vous reconnecter.';
    if (status === 422) return 'Certaines donnees sont invalides. Verifiez le formulaire.';
    if (status === 429) return 'Trop de requetes. Merci de reessayer dans un instant.';

    if (status >= 500) {
        if (isDatabaseIssue(serverMessage)) {
            return 'Serveur indisponible: probleme de base de donnees ou de connexion backend.';
        }
        return 'Erreur interne du serveur. Merci de reessayer.';
    }

    if (serverMessage) return serverMessage;
    return `Erreur API (${status}).`;
};

const parseResponsePayload = async (response: Response) => {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const buildNetworkErrorMessage = (error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : String(error ?? '');
    const normalized = normalizeText(rawMessage);
    if (
        normalized.includes('failed to fetch')
        || normalized.includes('networkerror')
        || normalized.includes('err_network')
        || normalized.includes('err_connection_refused')
        || normalized.includes('load failed')
    ) {
        return 'Connexion impossible au serveur API. Verifiez que le backend et la base de donnees sont demarres.';
    }
    return rawMessage || 'Erreur reseau lors de la requete API.';
};

export const getApiErrorMessage = (
    error: unknown,
    fallbackMessage = 'Une erreur est survenue. Merci de reessayer.'
) => {
    const maybeApiError = error as ApiError | undefined;
    const validationMessage = maybeApiError?.validationErrors?.[0];
    if (validationMessage) return validationMessage;

    const bodyMessage =
        typeof maybeApiError?.body?.message === 'string'
            ? maybeApiError.body.message.trim()
            : '';
    if (bodyMessage) return bodyMessage;

    const serverMessage =
        typeof maybeApiError?.serverMessage === 'string'
            ? maybeApiError.serverMessage.trim()
            : '';
    if (serverMessage) return serverMessage;

    const baseMessage = maybeApiError?.message?.trim();
    if (baseMessage) return baseMessage;
    return fallbackMessage;
};

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

    const isAbsoluteEndpoint = /^https?:\/\//i.test(endpoint);
    const url = isAbsoluteEndpoint ? endpoint : `${API_BASE_URL}${endpoint}`;

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
            credentials: fetchOptions.credentials ?? 'same-origin',
            headers,
        });

        if (!response.ok) {
            const parsedPayload = await parseResponsePayload(response);
            const validationMessages = extractValidationMessages(parsedPayload);
            const serverMessage = extractServerMessage(parsedPayload);
            const friendlyMessage = buildFriendlyErrorMessage(
                response.status,
                serverMessage,
                validationMessages
            );

            const body =
                parsedPayload && typeof parsedPayload === 'object'
                    ? {
                        ...parsedPayload,
                        message: friendlyMessage,
                        server_message: serverMessage || undefined,
                        validation_messages:
                            validationMessages.length > 0 ? validationMessages : undefined,
                    }
                    : {
                        message: friendlyMessage,
                        server_message: serverMessage || undefined,
                        raw_payload: parsedPayload ?? undefined,
                        validation_messages:
                            validationMessages.length > 0 ? validationMessages : undefined,
                    };

            const err: ApiError = new Error(friendlyMessage);
            err.status = response.status;
            err.body = body;
            err.validationErrors = validationMessages;
            err.serverMessage = serverMessage;
            throw err;
        }

        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            const timeoutError: ApiError = new Error(
                `Delai d'attente depasse (${resolvedTimeout} ms).`
            );
            timeoutError.status = 408;
            timeoutError.body = { message: timeoutError.message };
            throw timeoutError;
        }

        const existingStatus = (error as ApiError)?.status;
        if (typeof existingStatus === 'number') {
            throw error;
        }

        const networkMessage = buildNetworkErrorMessage(error);
        const networkError: ApiError = new Error(networkMessage);
        networkError.status = 0;
        networkError.body = { message: networkMessage };
        throw networkError;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const apiGet = async (endpoint: string, options?: FetchOptions) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'GET',
    });
    return parseResponsePayload(response);
};

export const apiPost = async (
    endpoint: string,
    data?: unknown,
    options?: FetchOptions
) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'POST',
        body: data === undefined ? undefined : JSON.stringify(data),
    });
    return parseResponsePayload(response);
};

export const apiPut = async (
    endpoint: string,
    data?: unknown,
    options?: FetchOptions
) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'PUT',
        body: data === undefined ? undefined : JSON.stringify(data),
    });
    return parseResponsePayload(response);
};

export const apiDelete = async (endpoint: string, options?: FetchOptions) => {
    const response = await apiFetch(endpoint, {
        ...options,
        method: 'DELETE',
    });
    return parseResponsePayload(response);
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
    return parseResponsePayload(response);
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
