import { useEffect, useMemo, useState } from "react";
import AuthService, {
	type ApiError,
	type LoginRequest,
	type RegisterRequest,
} from "./services/authService";
import FavAccountService, {
	type BankLookupResponse,
	type FavoriteAccountPayload,
	type FavoriteAccountRecord,
	type PagedFavoriteAccounts,
	extractBankCodeFromIban,
} from "./services/favAccountService";
import "./App.css";

type Screen =
	| "register"
	| "login"
	| "welcome"
	| "accounts"
	| "create"
	| "edit"
	| "detail";

type FormErrors = Record<string, string>;
type MessageTone = "success" | "error";

type ViewState = {
	screen: Screen;
	page: number;
	selectedAccountId: number | null;
};

const CUSTOMER_ID_KEY = "favorite-payee.customerId";
const CUSTOMER_NAME_KEY = "favorite-payee.customerName";
const PAGE_SIZE = 5;

const getStoredCustomerId = (): number | null => {
	const raw = window.localStorage.getItem(CUSTOMER_ID_KEY);
	if (!raw) {
		return null;
	}

	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getStoredCustomerName = (): string => {
	return window.localStorage.getItem(CUSTOMER_NAME_KEY) ?? "";
};

const formatApiError = (error: unknown): ApiError => {
	if (error && typeof error === "object" && "message" in error) {
		return error as ApiError;
	}

	return { message: "Something went wrong while talking to the server." };
};

const maskIban = (iban: string) => {
	if (iban.length <= 8) {
		return iban;
	}

	return `${iban.slice(0, 4)} ${iban.slice(4, 8)} ${iban
		.slice(8)
		.replace(/(.{4})/g, "$1 ")
		.trim()}`;
};

const formatDateTime = (value?: string) => {
	if (!value) {
		return "Not available";
	}

	return new Intl.DateTimeFormat("en-IN", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
};

function App() {
	const [customerId, setCustomerId] = useState<number | null>(() =>
		getStoredCustomerId(),
	);
	const [customerName, setCustomerName] = useState<string>(() =>
		getStoredCustomerName(),
	);
	const [view, setView] = useState<ViewState>(() => ({
		screen: getStoredCustomerId() ? "welcome" : "login",
		page: 0,
		selectedAccountId: null,
	}));
	const [accountsResponse, setAccountsResponse] =
		useState<PagedFavoriteAccounts | null>(null);
	const [accountsLoading, setAccountsLoading] = useState(false);
	const [accountsError, setAccountsError] = useState<string | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);
	const [selectedAccount, setSelectedAccount] =
		useState<FavoriteAccountRecord | null>(null);
	const [deleteInFlightId, setDeleteInFlightId] = useState<number | null>(null);

	const accounts = accountsResponse?.content ?? [];
	const currentBankCode = useMemo(
		() =>
			extractBankCodeFromIban(selectedAccount?.iban ?? "") ??
			selectedAccount?.bankCode ??
			null,
		[selectedAccount],
	);

	const setScreen = (screen: Screen) => {
		setView((current) => ({ ...current, screen }));
	};

	const openAccountsForCustomer = async (
		activeCustomerId: number,
		page: number,
	) => {
		setAccountsLoading(true);
		setAccountsError(null);
		setDetailError(null);

		try {
			const response = await FavAccountService.getAllFavAccounts(
				activeCustomerId,
				page,
				PAGE_SIZE,
			);
			setAccountsResponse(response);
		} catch (error) {
			setAccountsError(formatApiError(error).message);
		} finally {
			setAccountsLoading(false);
			setView((current) => ({
				...current,
				screen: "accounts",
				page,
			}));
		}
	};

	const openAccounts = async (page = view.page) => {
		if (!customerId) {
			setScreen("login");
			return;
		}

		await openAccountsForCustomer(customerId, page);
	};

	const openAccountDetail = async (
		accountId: number,
		nextScreen: "detail" | "edit",
	) => {
		if (!customerId) {
			setScreen("login");
			return;
		}

		setDetailLoading(true);
		setDetailError(null);
		setView((current) => ({
			...current,
			screen: nextScreen,
			selectedAccountId: accountId,
		}));

		try {
			const account = await FavAccountService.getFavAccountById(
				customerId,
				accountId,
			);
			setSelectedAccount(account);
		} catch (error) {
			setSelectedAccount(null);
			setDetailError(formatApiError(error).message);
		} finally {
			setDetailLoading(false);
		}
	};

	const goRegister = () => {
		setAccountsError(null);
		setDetailError(null);
		setScreen("register");
	};

	const goLogin = () => {
		setAccountsError(null);
		setDetailError(null);
		setScreen("login");
	};

	const goCreate = () => {
		if (!customerId) {
			goLogin();
			return;
		}

		setSelectedAccount(null);
		setAccountsError(null);
		setDetailError(null);
		setView((current) => ({
			...current,
			screen: "create",
			selectedAccountId: null,
		}));
	};

	const handleLoginSuccess = async (
		nextCustomerId: number,
		nextCustomerName: string,
	) => {
		window.localStorage.setItem(CUSTOMER_ID_KEY, String(nextCustomerId));
		window.localStorage.setItem(CUSTOMER_NAME_KEY, nextCustomerName);
		setCustomerId(nextCustomerId);
		setCustomerName(nextCustomerName);
		setSelectedAccount(null);
		setAccountsResponse(null);
		setView({
			screen: "welcome",
			page: 0,
			selectedAccountId: null,
		});
	};

	const handleLogout = () => {
		window.localStorage.removeItem(CUSTOMER_ID_KEY);
		window.localStorage.removeItem(CUSTOMER_NAME_KEY);
		setCustomerId(null);
		setCustomerName("");
		setSelectedAccount(null);
		setAccountsResponse(null);
		setAccountsError(null);
		setDetailError(null);
		setView({
			screen: "login",
			page: 0,
			selectedAccountId: null,
		});
	};

	const handleDelete = async (accountId: number) => {
		if (!customerId) {
			return;
		}

		const confirmed = window.confirm("Delete this favorite payee?");
		if (!confirmed) {
			return;
		}

		setDeleteInFlightId(accountId);

		try {
			await FavAccountService.deleteFavAccount(customerId, accountId);
			if (view.selectedAccountId === accountId) {
				setSelectedAccount(null);
				setView((current) => ({ ...current, selectedAccountId: null }));
			}

			const nextPage =
				accounts.length === 1 && view.page > 0 ? view.page - 1 : view.page;
			await openAccounts(nextPage);
		} catch (error) {
			setAccountsError(formatApiError(error).message);
		} finally {
			setDeleteInFlightId(null);
		}
	};

	return (
		<div className="app-shell auth-first-shell">
			<header className="topbar compact-topbar">
				<div className="brand-block">
					{customerId === null ? (
						<>
							<h1 className="brand-title">Favorite Payee Hub</h1>
							<p className="brand-copy">
								Access starts with login or registration.
							</p>
						</>
					) : (
						<>
							<h1 className="brand-title">Welcome</h1>
							<p className="brand-copy">You are now signed in.</p>
						</>
					)}
				</div>

				{customerId !== null && (
					<nav className="nav-actions" aria-label="Workspace">
						<button
							type="button"
							className="nav-link"
							onClick={() => void openAccounts()}
						>
							Favorite accounts
						</button>
						<button
							type="button"
							className="nav-link nav-link-strong"
							onClick={handleLogout}
						>
							Log out
						</button>
					</nav>
				)}
			</header>

			<main className="main-content">
				{view.screen === "register" && customerId === null && (
					<RegisterScreen
						onBackToLogin={goLogin}
						onRegistered={(nextCustomerId, nextCustomerName) => {
							void handleLoginSuccess(nextCustomerId, nextCustomerName);
						}}
					/>
				)}

				{view.screen === "login" && customerId === null && (
					<LoginScreen
						customerIdHint={customerId}
						onBackToRegister={goRegister}
						onLoggedIn={(nextCustomerId, nextCustomerName) => {
							void handleLoginSuccess(nextCustomerId, nextCustomerName);
						}}
					/>
				)}

				{view.screen === "welcome" && customerId !== null && (
					<WelcomeScreen customerName={customerName} />
				)}

				{view.screen === "accounts" && (
					<AccountsScreen
						customerId={customerId}
						accounts={accounts}
						pageNumber={accountsResponse?.pageNumber ?? view.page}
						totalPages={accountsResponse?.totalPages ?? 0}
						totalElements={accountsResponse?.totalElements ?? 0}
						loading={accountsLoading}
						error={accountsError}
						deleteInFlightId={deleteInFlightId}
						onCreate={goCreate}
						onEdit={(accountId) => void openAccountDetail(accountId, "edit")}
						onDelete={(accountId) => void handleDelete(accountId)}
						onPageChange={(page) => void openAccounts(page)}
					/>
				)}

				{view.screen === "create" && customerId && (
					<AccountFormScreen
						key="create-account"
						mode="create"
						customerId={customerId}
						onCancel={() => void openAccounts(view.page)}
						onSaved={async () => {
							await openAccounts(0);
						}}
					/>
				)}

				{view.screen === "edit" && customerId && (
					<AccountFormScreen
						key={`edit-${view.selectedAccountId ?? "unknown"}`}
						mode="edit"
						customerId={customerId}
						account={selectedAccount}
						accountId={view.selectedAccountId}
						loading={detailLoading}
						loadError={detailError}
						deleteLoading={deleteInFlightId === view.selectedAccountId}
						onCancel={() => void openAccounts(view.page)}
						onDelete={() => {
							if (view.selectedAccountId) {
								void handleDelete(view.selectedAccountId);
							}
						}}
						onSaved={async () => {
							await openAccounts(view.page);
						}}
					/>
				)}

				{view.screen === "detail" && (
					<DetailScreen
						customerId={customerId}
						account={selectedAccount}
						loading={detailLoading}
						error={detailError}
						currentBankCode={currentBankCode}
						onBack={() => void openAccounts(view.page)}
						onEdit={() => {
							if (view.selectedAccountId) {
								void openAccountDetail(view.selectedAccountId, "edit");
							}
						}}
						onDelete={() => {
							if (view.selectedAccountId) {
								void handleDelete(view.selectedAccountId);
							}
						}}
					/>
				)}
			</main>
		</div>
	);
}

function RegisterScreen({
	onBackToLogin,
	onRegistered,
}: {
	onBackToLogin: () => void;
	onRegistered: (customerId: number, customerName: string) => void;
}) {
	const [formData, setFormData] = useState<RegisterRequest>({
		name: "",
		email: "",
		password: "",
	});
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState<FormErrors>({});
	const [apiMessage, setApiMessage] = useState<string | null>(null);
	const [messageTone, setMessageTone] = useState<MessageTone>("success");

	const validate = () => {
		const nextErrors: FormErrors = {};

		if (!formData.name.trim()) {
			nextErrors.name = "Name is required.";
		}

		if (!formData.email.trim()) {
			nextErrors.email = "Email is required.";
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			nextErrors.email = "Use a valid email address.";
		}

		if (!formData.password) {
			nextErrors.password = "Password is required.";
		} else if (formData.password.length < 6) {
			nextErrors.password = "Password must be at least 6 characters.";
		}

		if (formData.password !== confirmPassword) {
			nextErrors.confirmPassword = "Passwords do not match.";
		}

		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setApiMessage(null);

		if (!validate()) {
			return;
		}

		setLoading(true);

		try {
			const response = await AuthService.register(formData);
			const nextCustomerId = Number(response.customerId);
			setMessageTone("success");
			setApiMessage(
				response.message
					? `${response.message}. Customer ID: ${nextCustomerId}`
					: `Registration successful. Customer ID: ${nextCustomerId}`,
			);
			onRegistered(nextCustomerId, response.name ?? formData.name.trim());
		} catch (error) {
			const apiError = formatApiError(error);
			setErrors(apiError.fieldErrors ?? {});
			setMessageTone("error");
			setApiMessage(apiError.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="content-grid">
			<div className="form-shell auth-panel">
				<div className="section-heading auth-heading">
					<span className="eyebrow">New customer</span>
					<h2>Register</h2>
					<p>Create your profile first, then continue with your customer ID.</p>
				</div>

				<form className="stacked-form" onSubmit={handleSubmit}>
					<FormField
						label="Full name"
						name="name"
						value={formData.name}
						error={errors.name}
						onChange={(value) =>
							setFormData((current) => ({ ...current, name: value }))
						}
					/>
					<FormField
						label="Email"
						name="email"
						type="email"
						value={formData.email}
						error={errors.email}
						onChange={(value) =>
							setFormData((current) => ({ ...current, email: value }))
						}
					/>
					<FormField
						label="Password"
						name="password"
						type="password"
						value={formData.password}
						error={errors.password}
						onChange={(value) =>
							setFormData((current) => ({ ...current, password: value }))
						}
					/>
					<FormField
						label="Confirm password"
						name="confirmPassword"
						type="password"
						value={confirmPassword}
						error={errors.confirmPassword}
						onChange={setConfirmPassword}
					/>

					{apiMessage && (
						<MessageBanner tone={messageTone} message={apiMessage} />
					)}

					<div className="form-actions">
						<button type="submit" className="primary-button" disabled={loading}>
							{loading ? "Creating account..." : "Register"}
						</button>
						<button
							type="button"
							className="secondary-button"
							onClick={onBackToLogin}
						>
							Go to login
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}

function LoginScreen({
	customerIdHint,
	onBackToRegister,
	onLoggedIn,
}: {
	customerIdHint: number | null;
	onBackToRegister: () => void;
	onLoggedIn: (customerId: number, customerName: string) => void;
}) {
	const [formData, setFormData] = useState<LoginRequest>({
		customerId: customerIdHint ?? 0,
		password: "",
	});
	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState<FormErrors>({});
	const [apiMessage, setApiMessage] = useState<string | null>(null);

	const validate = () => {
		const nextErrors: FormErrors = {};

		if (!Number.isInteger(formData.customerId) || formData.customerId <= 0) {
			nextErrors.customerId = "Use a valid customer ID.";
		}

		if (!formData.password) {
			nextErrors.password = "Password is required.";
		}

		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setApiMessage(null);

		if (!validate()) {
			return;
		}

		setLoading(true);

		try {
			const response = await AuthService.login(formData);
			onLoggedIn(formData.customerId, response.name ?? "");
		} catch (error) {
			const apiError = formatApiError(error);
			setErrors(apiError.fieldErrors ?? {});
			setApiMessage(apiError.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="content-grid">
			<div className="form-shell auth-panel">
				<div className="section-heading auth-heading">
					<span className="eyebrow">Existing customer</span>
					<h2>Login</h2>
					<p>Use your customer ID and password to enter the application.</p>
				</div>

				<form className="stacked-form" onSubmit={handleSubmit}>
					<FormField
						label="Customer ID"
						name="customerId"
						type="number"
						value={formData.customerId > 0 ? String(formData.customerId) : ""}
						error={errors.customerId}
						onChange={(value) =>
							setFormData((current) => ({
								...current,
								customerId: Number(value) || 0,
							}))
						}
					/>
					<FormField
						label="Password"
						name="password"
						type="password"
						value={formData.password}
						error={errors.password}
						onChange={(value) =>
							setFormData((current) => ({ ...current, password: value }))
						}
					/>

					{apiMessage && <MessageBanner tone="error" message={apiMessage} />}

					<div className="form-actions">
						<button type="submit" className="primary-button" disabled={loading}>
							{loading ? "Signing in..." : "Login"}
						</button>
						<button
							type="button"
							className="secondary-button"
							onClick={onBackToRegister}
						>
							Go to register
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}

function WelcomeScreen({ customerName }: { customerName: string }) {
	return (
		<section className="content-grid welcome-only">
			<div className="welcome-copy">
				<h2>Welcome{customerName ? `, ${customerName}` : ""}</h2>
			</div>
		</section>
	);
}

function AccountsScreen({
	customerId,
	accounts,
	pageNumber,
	totalPages,
	totalElements,
	loading,
	error,
	deleteInFlightId,
	onCreate,
	onEdit,
	onDelete,
	onPageChange,
}: {
	customerId: number | null;
	accounts: FavoriteAccountRecord[];
	pageNumber: number;
	totalPages: number;
	totalElements: number;
	loading: boolean;
	error: string | null;
	deleteInFlightId: number | null;
	onCreate: () => void;
	onEdit: (accountId: number) => void;
	onDelete: (accountId: number) => void;
	onPageChange: (page: number) => void;
}) {
	const hasPagination = totalPages > 1;
	const currentPageLabel = totalPages === 0 ? 0 : pageNumber + 1;

	return (
		<section className="phone-screen">
			<div className="phone-panel">
				<div className="phone-header">
					<h2>Favorite accounts</h2>
					<p className="phone-subtitle">Customer {customerId ?? ""}</p>
				</div>

				<button type="button" className="add-link-button" onClick={onCreate}>
					<span className="add-link-icon">+</span>
					<span>Add a new account</span>
				</button>

				{error && <MessageBanner tone="error" message={error} />}

				{loading ? (
					<LoadingPanel message="Loading favorite accounts..." />
				) : accounts.length === 0 ? (
					<div className="list-empty-state">
						<p>No favorite accounts yet.</p>
					</div>
				) : (
					<>
						<div className="list-summary">
							<span>{totalElements} saved account{totalElements === 1 ? "" : "s"}</span>
							<span>
								Page {currentPageLabel} of {Math.max(totalPages, 1)}
							</span>
						</div>

						<div className="account-list">
							{accounts.map((account) => (
								<AccountListRow
									key={account.accountId}
									account={account}
									isDeleting={deleteInFlightId === account.accountId}
									onEdit={onEdit}
									onDelete={onDelete}
								/>
							))}
						</div>

						{hasPagination && (
							<div className="pagination-bar account-pagination">
								<button
									type="button"
									className="secondary-button"
									disabled={pageNumber === 0}
									onClick={() => onPageChange(pageNumber - 1)}
								>
									Previous
								</button>
								<div className="pagination-status">
									<span>{PAGE_SIZE} per page</span>
								</div>
								<button
									type="button"
									className="secondary-button"
									disabled={pageNumber >= totalPages - 1}
									onClick={() => onPageChange(pageNumber + 1)}
								>
									Next
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</section>
	);
}

function AccountFormScreen({
	mode,
	customerId,
	account,
	accountId,
	loading = false,
	loadError = null,
	deleteLoading = false,
	onCancel,
	onDelete,
	onSaved,
}: {
	mode: "create" | "edit";
	customerId: number;
	account?: FavoriteAccountRecord | null;
	accountId?: number | null;
	loading?: boolean;
	loadError?: string | null;
	deleteLoading?: boolean;
	onCancel: () => void;
	onDelete?: () => void;
	onSaved: (accountId: number) => void | Promise<void>;
}) {
	const [formData, setFormData] = useState<FavoriteAccountPayload>({
		accountName: account?.accountName ?? "",
		iban: account?.iban ?? "",
		bankCode: account?.bankCode ?? 0,
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [apiMessage, setApiMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [bankLookup, setBankLookup] = useState<BankLookupResponse | null>(
		account
			? {
					bankCode: account.bankCode,
					bankName: account.bankName,
				}
			: null,
	);
	const [bankLookupLoading, setBankLookupLoading] = useState(false);

	useEffect(() => {
		setFormData({
			accountName: account?.accountName ?? "",
			iban: account?.iban ?? "",
			bankCode: account?.bankCode ?? 0,
		});
		setBankLookup(
			account
				? {
						bankCode: account.bankCode,
						bankName: account.bankName,
					}
				: null,
		);
		setErrors({});
		setApiMessage(null);
		setBankLookupLoading(false);
	}, [account, mode, accountId]);

	const derivedBankCode = extractBankCodeFromIban(formData.iban);
	const effectiveBankCode = bankLookup?.bankCode ?? derivedBankCode ?? formData.bankCode;
	const canSave =
		!saving &&
		!bankLookupLoading &&
		Boolean(bankLookup?.bankName) &&
		(derivedBankCode === null || bankLookup?.bankCode === derivedBankCode);

	const handleIbanInputChange = (value: string) => {
		const normalizedIban = value.replace(/\s+/g, "").toUpperCase();

		setFormData((current) => ({
			...current,
			iban: normalizedIban,
		}));
		setApiMessage(null);
		setBankLookup(null);
		setBankLookupLoading(false);
		setErrors((current) => {
			const nextErrors = { ...current };
			delete nextErrors.bankCode;
			return nextErrors;
		});
	};

	const handleIbanBlur = async () => {
		const normalizedIban = formData.iban.replace(/\s+/g, "").toUpperCase();
		const nextBankCode = extractBankCodeFromIban(normalizedIban);

		if (nextBankCode === null) {
			setBankLookup(null);
			return;
		}

		setBankLookup(null);
		setBankLookupLoading(true);

		try {
			const bank = await FavAccountService.getBankByCode(nextBankCode);
			setBankLookup(bank);
			setErrors((current) => {
				const nextErrors = { ...current };
				delete nextErrors.bankCode;
				return nextErrors;
			});
		} catch (error) {
			const apiError = formatApiError(error);
			setBankLookup(null);
			setErrors((current) => ({
				...current,
				bankCode: apiError.message,
			}));
		} finally {
			setBankLookupLoading(false);
		}
	};

	const validate = () => {
		const nextErrors: FormErrors = {};

		if (!formData.accountName.trim()) {
			nextErrors.accountName = "Account name is required.";
		} else if (!/^[a-zA-Z0-9 '-]+$/.test(formData.accountName.trim())) {
			nextErrors.accountName =
				"Use letters, numbers, spaces, apostrophes, or hyphens only.";
		}

		if (!formData.iban.trim()) {
			nextErrors.iban = "IBAN is required.";
		} else if (!/^[a-zA-Z0-9]+$/.test(formData.iban)) {
			nextErrors.iban = "IBAN must contain letters and numbers only.";
		} else if (formData.iban.length > 20) {
			nextErrors.iban = "IBAN must not exceed 20 characters.";
		}

		if (!bankLookup?.bankName) {
			nextErrors.bankCode =
				"Enter a valid IBAN so the bank can be populated automatically.";
		}

		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setApiMessage(null);

		if (!validate()) {
			return;
		}

		setSaving(true);

		try {
			const payload: FavoriteAccountPayload = {
				accountName: formData.accountName.trim(),
				iban: formData.iban.trim().toUpperCase(),
				bankCode: effectiveBankCode,
			};

			const response =
				mode === "edit" && accountId
					? await FavAccountService.updateFavAccount(
							customerId,
							accountId,
							payload,
						)
					: await FavAccountService.addFavAccount(customerId, payload);

			await onSaved(response.accountId);
		} catch (error) {
			const apiError = formatApiError(error);
			setErrors(apiError.fieldErrors ?? {});
			setApiMessage(apiError.message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="phone-screen">
			<div className="phone-panel form-panel">
				<div className="phone-header">
					<h2>
						{mode === "edit" ? "Edit favorite account" : "Add favorite account"}
					</h2>
				</div>

				{loading ? (
					<LoadingPanel message="Loading account..." />
				) : loadError ? (
					<MessageBanner tone="error" message={loadError} />
				) : (
					<form className="stacked-form compact-form" onSubmit={handleSubmit}>
						<FormField
							label="Account name"
							name="accountName"
							value={formData.accountName}
							error={errors.accountName}
							onChange={(value) =>
								setFormData((current) => ({ ...current, accountName: value }))
							}
						/>
						<FormField
							label="IBAN"
							name="iban"
							value={formData.iban}
							error={errors.iban}
							onChange={handleIbanInputChange}
							onBlur={() => {
								void handleIbanBlur();
							}}
						/>

						<div className="form-field">
							<label htmlFor="bankCode">Bank</label>
							<input
								id="bankCode"
								name="bankCode"
								type="text"
								value={
									bankLookupLoading
										? "Looking up bank..."
										: bankLookup?.bankName ?? ""
								}
								readOnly
							/>
							{errors.bankCode && (
								<span className="field-error">{errors.bankCode}</span>
							)}
						</div>

						{apiMessage && <MessageBanner tone="error" message={apiMessage} />}

						<div className="form-actions vertical-actions">
							<button
								type="submit"
								className="primary-button full-width-button"
								disabled={!canSave || deleteLoading}
							>
								{saving
									? "Saving..."
									: "Save"}
							</button>
							{mode === "edit" && onDelete ? (
								<button
									type="button"
									className="primary-button full-width-button delete-solid-button"
									onClick={onDelete}
									disabled={deleteLoading}
								>
									{deleteLoading ? "Deleting..." : "Delete"}
								</button>
							) : null}
							<button
								type="button"
								className="secondary-button full-width-button"
								onClick={onCancel}
								disabled={saving || deleteLoading}
							>
								Cancel
							</button>
						</div>
					</form>
				)}
			</div>
		</section>
	);
}

function DetailScreen({
	customerId,
	account,
	loading,
	error,
	currentBankCode,
	onBack,
	onEdit,
	onDelete,
}: {
	customerId: number | null;
	account: FavoriteAccountRecord | null;
	loading: boolean;
	error: string | null;
	currentBankCode: number | null;
	onBack: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	if (loading) {
		return <LoadingPanel message="Loading account detail..." />;
	}

	if (error) {
		return (
			<section className="content-grid">
				<MessageBanner tone="error" message={error} />
			</section>
		);
	}

	if (!account) {
		return (
			<section className="content-grid">
				<div className="panel-card empty-state">
					<h3>No account selected</h3>
					<p>Choose an account from the dashboard to inspect its details.</p>
					<button type="button" className="secondary-button" onClick={onBack}>
						Back to dashboard
					</button>
				</div>
			</section>
		);
	}

	return (
		<section className="detail-layout">
			<div className="detail-hero">
				<div>
					<span className="eyebrow">Customer {customerId}</span>
					<h2>{account.accountName}</h2>
					<p>
						Full backend response details for one saved beneficiary account.
					</p>
				</div>

				<div className="detail-actions">
					<button type="button" className="secondary-button" onClick={onBack}>
						Back
					</button>
					<button type="button" className="secondary-button" onClick={onEdit}>
						Edit
					</button>
					<button type="button" className="danger-button" onClick={onDelete}>
						Delete
					</button>
				</div>
			</div>

			<div className="detail-grid">
				<DetailCard label="Account ID" value={String(account.accountId)} />
				<DetailCard label="Customer ID" value={String(account.customerId)} />
				<DetailCard label="Bank name" value={account.bankName} />
				<DetailCard label="Bank code" value={String(account.bankCode)} />
				<DetailCard
					label="Derived from IBAN"
					value={
						currentBankCode === null ? "Unavailable" : String(currentBankCode)
					}
				/>
				<DetailCard label="IBAN" value={maskIban(account.iban)} mono />
				<DetailCard
					label="Created at"
					value={formatDateTime(account.createdAt)}
				/>
				<DetailCard
					label="Updated at"
					value={formatDateTime(account.updatedAt)}
				/>
			</div>
		</section>
	);
}

function FormField({
	label,
	name,
	value,
	type = "text",
	error,
	onChange,
	onBlur,
}: {
	label: string;
	name: string;
	value: string;
	type?: string;
	error?: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
}) {
	return (
		<div className="form-field">
			<label htmlFor={name}>{label}</label>
			<input
				id={name}
				name={name}
				type={type}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onBlur={onBlur}
			/>
			{error && <span className="field-error">{error}</span>}
		</div>
	);
}

function MessageBanner({
	tone,
	message,
}: {
	tone: MessageTone;
	message: string;
}) {
	return (
		<div className={`message-banner message-banner-${tone}`}>{message}</div>
	);
}

function DetailCard({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="detail-card">
			<span>{label}</span>
			<strong className={mono ? "mono" : undefined}>{value}</strong>
		</div>
	);
}

function LoadingPanel({ message }: { message: string }) {
	return (
		<section className="content-grid">
			<div className="panel-card centered-panel">
				<div className="loader" />
				<p>{message}</p>
			</div>
		</section>
	);
}

function AccountListRow({
	account,
	isDeleting,
	onEdit,
	onDelete,
}: {
	account: FavoriteAccountRecord;
	isDeleting: boolean;
	onEdit: (accountId: number) => void;
	onDelete: (accountId: number) => void;
}) {
	return (
		<article className="account-row">
			<div className="account-row-main">
				<div>
					<h3>{account.accountName}</h3>
					<p>{maskIban(account.iban)}</p>
					<p>{account.bankName}</p>
				</div>
				<button
					type="button"
					className="row-edit-button"
					onClick={() => onEdit(account.accountId)}
				>
					Edit
				</button>
			</div>
			<div className="row-actions">
				<button
					type="button"
					className="inline-button inline-button-danger"
					disabled={isDeleting}
					onClick={() => onDelete(account.accountId)}
				>
					{isDeleting ? "Deleting..." : "Delete"}
				</button>
			</div>
		</article>
	);
}

export default App;
