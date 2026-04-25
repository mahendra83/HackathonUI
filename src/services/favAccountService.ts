import type { ApiError } from "./authService";

const API_BASE_URL = "http://localhost:8080/api/customers";

export interface FavoriteAccountPayload {
	accountName: string;
	iban: string;
	bankCode: number;
}

export interface FavoriteAccountRecord {
	accountId: number;
	customerId: number;
	accountName: string;
	iban: string;
	bankCode: number;
	bankName: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface BankLookupResponse {
	bankCode: number;
	bankName: string;
}

type RawBankLookupResponse = {
	bankCode?: number;
	bankName?: string;
	bank_code?: number;
	bank_name?: string;
};

export interface PagedFavoriteAccounts {
	content: FavoriteAccountRecord[];
	pageNumber: number;
	pageSize: number;
	totalElements: number;
	totalPages: number;
	last: boolean;
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
				: "Favorite account request failed.",
		status: response.status,
		error: typeof payload?.error === "string" ? payload.error : undefined,
		fieldErrors:
			payload?.fieldErrors && typeof payload.fieldErrors === "object"
				? (payload.fieldErrors as Record<string, string>)
				: undefined,
	};
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(url, init);

	if (!response.ok) {
		throw await buildApiError(response);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
};

export const extractBankCodeFromIban = (iban: string): number | null => {
	const normalized = iban.replace(/\s+/g, "").toUpperCase();
	if (normalized.length < 8) {
		return null;
	}

	const code = normalized.slice(4, 8);
	return /^\d{4}$/.test(code) ? Number(code) : null;
};

class FavAccountService {
	async getBankByCode(bankCode: number): Promise<BankLookupResponse> {
		const response = await requestJson<RawBankLookupResponse>(
			`http://localhost:8080/api/banks/${bankCode}`,
		);

		return {
			bankCode: response.bankCode ?? response.bank_code ?? bankCode,
			bankName: response.bankName ?? response.bank_name ?? "",
		};
	}

	getAllFavAccounts(
		customerId: number,
		page = 0,
		size = 5,
	): Promise<PagedFavoriteAccounts> {
		return requestJson<PagedFavoriteAccounts>(
			`${API_BASE_URL}/${customerId}/favorite-accounts?page=${page}&size=${size}`,
		);
	}

	getFavAccountById(
		customerId: number,
		accountId: number,
	): Promise<FavoriteAccountRecord> {
		return requestJson<FavoriteAccountRecord>(
			`${API_BASE_URL}/${customerId}/favorite-accounts/${accountId}`,
		);
	}

	addFavAccount(
		customerId: number,
		favAccount: FavoriteAccountPayload,
	): Promise<FavoriteAccountRecord> {
		return requestJson<FavoriteAccountRecord>(
			`${API_BASE_URL}/${customerId}/favorite-accounts`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(favAccount),
			},
		);
	}

	updateFavAccount(
		customerId: number,
		accountId: number,
		favAccount: FavoriteAccountPayload,
	): Promise<FavoriteAccountRecord> {
		return requestJson<FavoriteAccountRecord>(
			`${API_BASE_URL}/${customerId}/favorite-accounts/${accountId}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(favAccount),
			},
		);
	}

	deleteFavAccount(customerId: number, accountId: number): Promise<void> {
		return requestJson<void>(
			`${API_BASE_URL}/${customerId}/favorite-accounts/${accountId}`,
			{
				method: "DELETE",
			},
		);
	}
}

export default new FavAccountService();
