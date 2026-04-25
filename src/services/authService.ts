const AUTH_API_BASE_URL = "http://localhost:8080/api/auth";

export interface RegisterRequest {
	name: string;
	email: string;
	password: string;
}

export interface LoginRequest {
	customerId: number;
	password: string;
}

export interface AuthResponse {
	customerId?: number;
	name?: string;
	message?: string;
	[key: string]: unknown;
}

export interface ApiError {
	message: string;
	status?: number;
	error?: string;
	fieldErrors?: Record<string, string>;
}

const buildApiError = async (response: Response): Promise<ApiError> => {
	let payload: Record<string, unknown> | null;

	try {
		payload = (await response.json()) as Record<string, unknown>;
	} catch {
		payload = null;
	}

	return {
		message:
			typeof payload?.message === "string"
				? payload.message
				: "Request failed. Please try again.",
		status: response.status,
		error: typeof payload?.error === "string" ? payload.error : undefined,
		fieldErrors:
			payload?.fieldErrors && typeof payload.fieldErrors === "object"
				? (payload.fieldErrors as Record<string, string>)
				: undefined,
	};
};

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw await buildApiError(response);
	}

	return (await response.json()) as T;
};

class AuthService {
	register(userData: RegisterRequest): Promise<AuthResponse> {
		return postJson<AuthResponse>(`${AUTH_API_BASE_URL}/register`, userData);
	}

	login(credentials: LoginRequest): Promise<AuthResponse> {
		return postJson<AuthResponse>(`${AUTH_API_BASE_URL}/login`, credentials);
	}
}

export default new AuthService();
