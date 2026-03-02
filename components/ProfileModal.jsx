import React, { useEffect, useMemo, useState } from 'react';
import { Camera, RefreshCw, Shield, UserCircle2, X } from 'lucide-react';
import { API_BASE_URL, apiFetch, apiGet } from '../src/api';

const toList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const toItem = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray(payload)) return null;
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return payload.data;
    }
    return payload;
};

const normalizeToken = (value) => {
    if (value === null || value === undefined) return '';
    return value
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
};

const parseDateMs = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const formatDateTime = (value) => {
    const ms = parseDateMs(value);
    if (!ms) return '-';
    return new Date(ms).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const parseAmount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const raw = String(value).trim();
    if (!raw) return null;
    const cleaned = raw.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
    if (!cleaned) return null;

    let normalized = cleaned;
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        normalized = lastComma > lastDot
            ? normalized.replace(/\./g, '').replace(',', '.')
            : normalized.replace(/,/g, '');
    } else if (hasComma) {
        normalized = normalized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
};

const formatAmount = (value) => {
    const parsed = parseAmount(value);
    if (parsed === null) return '-';
    return `${parsed.toFixed(2)} F CFA`;
};

const buildMediaUrl = (value) => {
    if (!value || typeof value !== 'string') return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_BASE_URL}${value}`;
    if (value.startsWith('storage/')) return `${API_BASE_URL}/${value}`;
    if (value.startsWith('public/')) return `${API_BASE_URL}/storage/${value.replace(/^public\//, '')}`;
    if (value.startsWith('uploads/')) return `${API_BASE_URL}/${value}`;
    return `${API_BASE_URL}/storage/${value}`;
};

const getAvatarUrl = (profile) => {
    const raw =
        profile?.avatar_url ??
        profile?.avatar ??
        profile?.photo ??
        profile?.image ??
        profile?.media?.url;
    if (typeof raw === 'object') {
        return buildMediaUrl(raw?.url ?? raw?.path ?? raw?.original_url ?? '');
    }
    return buildMediaUrl(raw ?? '');
};

const getTokenList = (profile) => {
    const candidates = [
        profile?.tokens,
        profile?.access_tokens,
        profile?.personal_access_tokens,
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
        if (Array.isArray(candidate?.data)) return candidate.data;
    }
    return [];
};

const getTokenId = (token) => (
    token?.id ??
    token?.token_id ??
    token?.access_token_id ??
    null
);

const getTokenLabel = (token) => (
    token?.name ??
    token?.token_name ??
    token?.device ??
    'Token'
);

const getCotisationStatusKind = (cotisation) => {
    const token = normalizeToken(
        cotisation?.statut ??
        cotisation?.status ??
        cotisation?.etat ??
        cotisation?.payment_status ??
        cotisation?.state
    );
    if (token.includes('partiel')) return 'partiel';
    if (token.includes('annule')) return 'annule';
    if (token.includes('retard') || token.includes('late')) return 'en_attente';
    if (token.includes('attente') || token.includes('pending')) return 'en_attente';
    if (token.includes('paye') || token.includes('paid') || token.includes('valide')) return 'paye';
    return 'inconnu';
};

const getCotisationDateValue = (cotisation) => (
    cotisation?.date_paiement ??
    cotisation?.payment_date ??
    cotisation?.date ??
    cotisation?.paid_at ??
    cotisation?.created_at ??
    cotisation?.updated_at
);

const ProfileModal = ({ isOpen, onClose, onLogout }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [globalError, setGlobalError] = useState('');
    const [notice, setNotice] = useState({ type: '', message: '' });

    const [profileData, setProfileData] = useState(null);
    const [profileForm, setProfileForm] = useState({
        nom: '',
        prenom: '',
        telephone: '',
        email: '',
    });
    const [passwordForm, setPasswordForm] = useState({
        current_password: '',
        password: '',
        password_confirmation: '',
    });
    const [preferencesForm, setPreferencesForm] = useState({
        theme: 'system',
        language: 'fr',
        timezone: 'Africa/Douala',
        email_notifications: true,
        push_notifications: true,
    });
    const [privacyForm, setPrivacyForm] = useState({
        show_phone: false,
        show_email: false,
        profile_visibility: 'members',
    });

    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [isSavingPreferences, setIsSavingPreferences] = useState(false);
    const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [revokingTokenId, setRevokingTokenId] = useState(null);
    const [avatarError, setAvatarError] = useState('');

    const [cotisations, setCotisations] = useState([]);
    const [isLoadingCotisations, setIsLoadingCotisations] = useState(false);
    const [cotisationsError, setCotisationsError] = useState('');
    const [cotisationsFilters, setCotisationsFilters] = useState({
        status: '',
        from: '',
        to: '',
    });

    const avatarUrl = useMemo(() => getAvatarUrl(profileData), [profileData]);
    const tokens = useMemo(() => getTokenList(profileData), [profileData]);

    const cotisationRows = useMemo(() => {
        return cotisations
            .map((item, index) => ({
                id: item?.id ?? `cotisation-${index}`,
                period: item?.periode ?? item?.period ?? item?.mois ?? item?.month ?? '-',
                amount: formatAmount(
                    item?.montant ??
                    item?.amount ??
                    item?.montant_cotisation ??
                    item?.montant_total ??
                    item?.total_amount
                ),
                status: getCotisationStatusKind(item),
                dateValue: getCotisationDateValue(item),
            }))
            .sort((a, b) => (parseDateMs(b.dateValue) ?? 0) - (parseDateMs(a.dateValue) ?? 0));
    }, [cotisations]);

    const pushNotice = (type, message) => {
        if (!message) return;
        setNotice({ type, message });
    };

    const hydrateProfile = (payload) => {
        const data = toItem(payload) || {};
        setProfileData(data);
        setProfileForm({
            nom: data?.nom ?? '',
            prenom: data?.prenom ?? '',
            telephone: data?.telephone ?? '',
            email: data?.email ?? '',
        });
        setPrivacyForm((prev) => ({
            ...prev,
            show_phone: Boolean(data?.show_phone ?? data?.privacy?.show_phone ?? prev.show_phone),
            show_email: Boolean(data?.show_email ?? data?.privacy?.show_email ?? prev.show_email),
            profile_visibility: data?.profile_visibility ?? data?.privacy?.profile_visibility ?? prev.profile_visibility,
        }));
        return data;
    };

    const hydratePreferences = (payload) => {
        const data = toItem(payload) || {};
        setPreferencesForm((prev) => ({
            ...prev,
            theme: data?.theme ?? prev.theme,
            language: data?.language ?? prev.language,
            timezone: data?.timezone ?? prev.timezone,
            email_notifications: Boolean(data?.email_notifications ?? prev.email_notifications),
            push_notifications: Boolean(data?.push_notifications ?? prev.push_notifications),
        }));
    };

    const fetchCotisations = async (filters = cotisationsFilters) => {
        setIsLoadingCotisations(true);
        setCotisationsError('');
        try {
            const params = new URLSearchParams();
            if (filters.status) params.set('status', filters.status);
            if (filters.from) params.set('from', filters.from);
            if (filters.to) params.set('to', filters.to);
            const query = params.toString();
            const response = await apiGet(`/api/me/cotisations${query ? `?${query}` : ''}`);
            setCotisations(toList(response));
        } catch (error) {
            setCotisations([]);
            setCotisationsError(error?.message || 'Impossible de charger les cotisations.');
        } finally {
            setIsLoadingCotisations(false);
        }
    };

    const loadAll = async () => {
        setIsLoading(true);
        setGlobalError('');
        setNotice({ type: '', message: '' });
        try {
            const [meRes, preferencesRes] = await Promise.all([
                apiGet('/api/me'),
                apiGet('/api/me/preferences').catch(() => null),
            ]);
            hydrateProfile(meRes);
            if (preferencesRes) hydratePreferences(preferencesRes);
            await fetchCotisations(cotisationsFilters);
        } catch (error) {
            setGlobalError(error?.message || 'Impossible de charger le profil.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (isSavingProfile) return;
        setIsSavingProfile(true);
        setGlobalError('');
        try {
            await apiFetch('/api/me', {
                method: 'PATCH',
                body: JSON.stringify({
                    nom: profileForm.nom.trim(),
                    prenom: profileForm.prenom.trim() || null,
                    telephone: profileForm.telephone.trim() || null,
                    email: profileForm.email.trim(),
                }),
            });
            await loadAll();
            pushNotice('success', 'Profil mis a jour.');
        } catch (error) {
            const message = error?.body?.message || 'La mise a jour du profil a echoue.';
            setGlobalError(message);
            pushNotice('error', message);
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSavePassword = async (e) => {
        e.preventDefault();
        if (isSavingPassword) return;
        if (!passwordForm.current_password || !passwordForm.password || !passwordForm.password_confirmation) {
            const message = 'Tous les champs du mot de passe sont obligatoires.';
            setGlobalError(message);
            pushNotice('error', message);
            return;
        }
        if (passwordForm.password !== passwordForm.password_confirmation) {
            const message = 'La confirmation du mot de passe ne correspond pas.';
            setGlobalError(message);
            pushNotice('error', message);
            return;
        }

        setIsSavingPassword(true);
        setGlobalError('');
        try {
            await apiFetch('/api/me/password', {
                method: 'PATCH',
                body: JSON.stringify(passwordForm),
            });
            setPasswordForm({
                current_password: '',
                password: '',
                password_confirmation: '',
            });
            pushNotice('success', 'Mot de passe mis a jour.');
        } catch (error) {
            const message = error?.body?.message || 'La mise a jour du mot de passe a echoue.';
            setGlobalError(message);
            pushNotice('error', message);
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleAvatarChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || isUploadingAvatar) return;

        setIsUploadingAvatar(true);
        setAvatarError('');
        try {
            const form = new FormData();
            form.append('avatar', file);
            await apiFetch('/api/me/avatar', {
                method: 'PATCH',
                body: form,
            });
            await loadAll();
            pushNotice('success', 'Avatar mis a jour.');
        } catch (error) {
            const message = error?.body?.message || "La mise a jour de l'avatar a echoue.";
            setAvatarError(message);
            pushNotice('error', message);
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleDeleteAvatar = async () => {
        if (isDeletingAvatar) return;
        const confirmed = window.confirm('Supprimer votre avatar ?');
        if (!confirmed) return;

        setIsDeletingAvatar(true);
        setAvatarError('');
        try {
            await apiFetch('/api/me/avatar', { method: 'DELETE' });
            await loadAll();
            pushNotice('success', 'Avatar supprime.');
        } catch (error) {
            const message = error?.body?.message || "La suppression de l'avatar a echoue.";
            setAvatarError(message);
            pushNotice('error', message);
        } finally {
            setIsDeletingAvatar(false);
        }
    };

    const handleSavePreferences = async (e) => {
        e.preventDefault();
        if (isSavingPreferences) return;
        setIsSavingPreferences(true);
        setGlobalError('');
        try {
            await apiFetch('/api/me/preferences', {
                method: 'PATCH',
                body: JSON.stringify({
                    theme: preferencesForm.theme,
                    language: preferencesForm.language.trim() || null,
                    timezone: preferencesForm.timezone.trim() || null,
                    email_notifications: Boolean(preferencesForm.email_notifications),
                    push_notifications: Boolean(preferencesForm.push_notifications),
                }),
            });
            pushNotice('success', 'Preferences mises a jour.');
        } catch (error) {
            const message = error?.body?.message || 'La mise a jour des preferences a echoue.';
            setGlobalError(message);
            pushNotice('error', message);
        } finally {
            setIsSavingPreferences(false);
        }
    };

    const handleSavePrivacy = async (e) => {
        e.preventDefault();
        if (isSavingPrivacy) return;
        setIsSavingPrivacy(true);
        setGlobalError('');
        try {
            await apiFetch('/api/me/privacy', {
                method: 'PATCH',
                body: JSON.stringify({
                    show_phone: Boolean(privacyForm.show_phone),
                    show_email: Boolean(privacyForm.show_email),
                    profile_visibility: privacyForm.profile_visibility,
                }),
            });
            pushNotice('success', 'Confidentialite mise a jour.');
        } catch (error) {
            const message = error?.body?.message || 'La mise a jour de la confidentialite a echoue.';
            setGlobalError(message);
            pushNotice('error', message);
        } finally {
            setIsSavingPrivacy(false);
        }
    };

    const handleRevokeToken = async (tokenId) => {
        if (!tokenId || revokingTokenId) return;
        setRevokingTokenId(tokenId);
        setGlobalError('');
        try {
            await apiFetch(`/api/me/tokens/${tokenId}`, { method: 'DELETE' });
            setProfileData((prev) => {
                if (!prev || typeof prev !== 'object') return prev;
                const removeToken = (value) => {
                    if (!Array.isArray(value)) return value;
                    return value.filter((token) => `${getTokenId(token)}` !== `${tokenId}`);
                };
                return {
                    ...prev,
                    tokens: removeToken(prev?.tokens),
                    access_tokens: removeToken(prev?.access_tokens),
                    personal_access_tokens: removeToken(prev?.personal_access_tokens),
                };
            });
            pushNotice('success', 'Session revoquee.');
        } catch (error) {
            const message = error?.body?.message || 'La revocation de la session a echoue.';
            setGlobalError(message);
            pushNotice('error', message);
        } finally {
            setRevokingTokenId(null);
        }
    };

    const handleLogout = async () => {
        if (!onLogout || isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await onLogout();
        } finally {
            setIsLoggingOut(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="Fermer le profil"
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <div className="relative z-10 w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-fuchsia-100 bg-white shadow-2xl">
                <div className="px-6 py-4 border-b border-fuchsia-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Mon profil</h2>
                        <p className="text-sm text-slate-500">
                            Gestion du compte, securite, preferences, confidentialite et cotisations.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {onLogout && (
                            <button
                                type="button"
                                onClick={handleLogout}
                                disabled={isLoggingOut}
                                className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold hover:bg-rose-50 disabled:opacity-60"
                            >
                                {isLoggingOut ? 'Deconnexion...' : 'Deconnexion'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(90vh-74px)]">
                    {isLoading && (
                        <div className="rounded-xl bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-700 inline-flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Chargement du profil...
                        </div>
                    )}

                    {globalError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {globalError}
                        </div>
                    )}

                    {notice.message && (
                        <div className={`rounded-xl border px-4 py-3 text-sm ${
                            notice.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                        }`}>
                            {notice.message}
                        </div>
                    )}

                    <div className="grid xl:grid-cols-[1.4fr_2.6fr] gap-5">
                        <section className="rounded-2xl border border-fuchsia-100 p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Avatar</h3>
                            <div className="flex items-center gap-3">
                                <div className="h-20 w-20 rounded-full overflow-hidden border border-fuchsia-200 bg-fuchsia-50 flex items-center justify-center">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                                    ) : (
                                        <UserCircle2 className="w-12 h-12 text-fuchsia-400" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-200 text-fuchsia-700 text-sm font-semibold cursor-pointer hover:bg-fuchsia-50">
                                        <Camera className="w-4 h-4" />
                                        {isUploadingAvatar ? 'Upload...' : 'Changer'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleAvatarChange}
                                            disabled={isUploadingAvatar || isDeletingAvatar}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleDeleteAvatar}
                                        disabled={isUploadingAvatar || isDeletingAvatar || !avatarUrl}
                                        className="block px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold hover:bg-rose-50 disabled:opacity-60"
                                    >
                                        {isDeletingAvatar ? 'Suppression...' : 'Supprimer'}
                                    </button>
                                </div>
                            </div>
                            {avatarError && (
                                <p className="text-xs text-red-600">{avatarError}</p>
                            )}
                        </section>

                        <form onSubmit={handleSaveProfile} className="rounded-2xl border border-fuchsia-100 p-4 space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Informations du compte</h3>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="profile-nom-global" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                        Nom
                                    </label>
                                    <input
                                        id="profile-nom-global"
                                        type="text"
                                        value={profileForm.nom}
                                        onChange={(e) => setProfileForm((prev) => ({ ...prev, nom: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="profile-prenom-global" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                        Prenom
                                    </label>
                                    <input
                                        id="profile-prenom-global"
                                        type="text"
                                        value={profileForm.prenom}
                                        onChange={(e) => setProfileForm((prev) => ({ ...prev, prenom: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="profile-tel-global" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                        Telephone
                                    </label>
                                    <input
                                        id="profile-tel-global"
                                        type="text"
                                        value={profileForm.telephone}
                                        onChange={(e) => setProfileForm((prev) => ({ ...prev, telephone: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="profile-email-global" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                        Email
                                    </label>
                                    <input
                                        id="profile-email-global"
                                        type="email"
                                        value={profileForm.email}
                                        onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingProfile || isLoading}
                                className="px-4 py-2.5 rounded-xl bg-fuchsia-700 text-white text-sm font-semibold hover:bg-fuchsia-800 disabled:opacity-60"
                            >
                                {isSavingProfile ? 'Mise a jour...' : 'Mettre a jour'}
                            </button>
                        </form>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-5">
                        <form onSubmit={handleSavePassword} className="rounded-2xl border border-fuchsia-100 p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide inline-flex items-center gap-2">
                                <Shield className="w-4 h-4 text-fuchsia-700" />
                                Securite
                            </h3>
                            <div>
                                <label htmlFor="profile-current-password" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                    Mot de passe actuel
                                </label>
                                <input
                                    id="profile-current-password"
                                    type="password"
                                    value={passwordForm.current_password}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor="profile-new-password" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                    Nouveau mot de passe
                                </label>
                                <input
                                    id="profile-new-password"
                                    type="password"
                                    value={passwordForm.password}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor="profile-confirm-password" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                    Confirmation
                                </label>
                                <input
                                    id="profile-confirm-password"
                                    type="password"
                                    value={passwordForm.password_confirmation}
                                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, password_confirmation: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingPassword || isLoading}
                                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                            >
                                {isSavingPassword ? 'Mise a jour...' : 'Changer le mot de passe'}
                            </button>
                        </form>

                        <form onSubmit={handleSavePreferences} className="rounded-2xl border border-fuchsia-100 p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Preferences</h3>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="pref-theme" className="block text-sm font-semibold text-slate-900 mb-1.5">Theme</label>
                                    <select
                                        id="pref-theme"
                                        value={preferencesForm.theme}
                                        onChange={(e) => setPreferencesForm((prev) => ({ ...prev, theme: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60"
                                    >
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                        <option value="system">System</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="pref-language" className="block text-sm font-semibold text-slate-900 mb-1.5">Langue</label>
                                    <input
                                        id="pref-language"
                                        type="text"
                                        value={preferencesForm.language}
                                        onChange={(e) => setPreferencesForm((prev) => ({ ...prev, language: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="pref-timezone" className="block text-sm font-semibold text-slate-900 mb-1.5">Timezone</label>
                                    <input
                                        id="pref-timezone"
                                        type="text"
                                        value={preferencesForm.timezone}
                                        onChange={(e) => setPreferencesForm((prev) => ({ ...prev, timezone: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(preferencesForm.email_notifications)}
                                        onChange={(e) => setPreferencesForm((prev) => ({ ...prev, email_notifications: e.target.checked }))}
                                        className="h-4 w-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                    />
                                    Notifications email
                                </label>
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(preferencesForm.push_notifications)}
                                        onChange={(e) => setPreferencesForm((prev) => ({ ...prev, push_notifications: e.target.checked }))}
                                        className="h-4 w-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                    />
                                    Notifications push
                                </label>
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingPreferences || isLoading}
                                className="px-4 py-2.5 rounded-xl bg-fuchsia-700 text-white text-sm font-semibold hover:bg-fuchsia-800 disabled:opacity-60"
                            >
                                {isSavingPreferences ? 'Mise a jour...' : 'Enregistrer preferences'}
                            </button>
                        </form>
                    </div>

                    <form onSubmit={handleSavePrivacy} className="rounded-2xl border border-fuchsia-100 p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Confidentialite</h3>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={Boolean(privacyForm.show_phone)}
                                    onChange={(e) => setPrivacyForm((prev) => ({ ...prev, show_phone: e.target.checked }))}
                                    className="h-4 w-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                />
                                Afficher mon telephone
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={Boolean(privacyForm.show_email)}
                                    onChange={(e) => setPrivacyForm((prev) => ({ ...prev, show_email: e.target.checked }))}
                                    className="h-4 w-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                />
                                Afficher mon email
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                Visibilite
                                <select
                                    value={privacyForm.profile_visibility}
                                    onChange={(e) => setPrivacyForm((prev) => ({ ...prev, profile_visibility: e.target.value }))}
                                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white"
                                >
                                    <option value="public">Public</option>
                                    <option value="members">Membres</option>
                                    <option value="private">Prive</option>
                                </select>
                            </label>
                        </div>
                        <button
                            type="submit"
                            disabled={isSavingPrivacy || isLoading}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                        >
                            {isSavingPrivacy ? 'Mise a jour...' : 'Enregistrer confidentialite'}
                        </button>
                    </form>

                    <section className="rounded-2xl border border-fuchsia-100 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Sessions actives</h3>
                            <button
                                type="button"
                                onClick={loadAll}
                                disabled={isLoading}
                                className="px-3 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-xs font-semibold hover:bg-fuchsia-50 disabled:opacity-60"
                            >
                                Recharger
                            </button>
                        </div>
                        <div className="space-y-2">
                            {tokens.length === 0 && (
                                <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500">
                                    Aucune session active remontee par l'API.
                                </div>
                            )}
                            {tokens.map((token, index) => {
                                const tokenId = getTokenId(token);
                                return (
                                    <div key={tokenId ?? `token-${index}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-900 truncate">{getTokenLabel(token)}</p>
                                            <p className="text-xs text-slate-500">
                                                Derniere utilisation: {formatDateTime(token?.last_used_at ?? token?.updated_at ?? token?.created_at)}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRevokeToken(tokenId)}
                                            disabled={!tokenId || revokingTokenId === tokenId}
                                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
                                        >
                                            {revokingTokenId === tokenId ? '...' : 'Revoquer'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-fuchsia-100 p-4 space-y-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Mes cotisations</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={cotisationsFilters.status}
                                    onChange={(e) => setCotisationsFilters((prev) => ({ ...prev, status: e.target.value }))}
                                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                >
                                    <option value="">Tous les statuts</option>
                                    <option value="en_attente">En attente</option>
                                    <option value="paye">Paye</option>
                                    <option value="partiel">Partiel</option>
                                    <option value="annule">Annule</option>
                                </select>
                                <input
                                    type="date"
                                    value={cotisationsFilters.from}
                                    onChange={(e) => setCotisationsFilters((prev) => ({ ...prev, from: e.target.value }))}
                                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                />
                                <input
                                    type="date"
                                    value={cotisationsFilters.to}
                                    onChange={(e) => setCotisationsFilters((prev) => ({ ...prev, to: e.target.value }))}
                                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => fetchCotisations(cotisationsFilters)}
                                    disabled={isLoadingCotisations}
                                    className="px-3 py-2 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-sm font-semibold hover:bg-fuchsia-50 disabled:opacity-60"
                                >
                                    {isLoadingCotisations ? '...' : 'Filtrer'}
                                </button>
                            </div>
                        </div>

                        {cotisationsError && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {cotisationsError}
                            </div>
                        )}

                        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                            {isLoadingCotisations && (
                                <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500">
                                    Chargement des cotisations...
                                </div>
                            )}
                            {!isLoadingCotisations && cotisationRows.length === 0 && (
                                <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500">
                                    Aucune cotisation trouvee.
                                </div>
                            )}
                            {!isLoadingCotisations && cotisationRows.map((row) => (
                                <article key={row.id} className="rounded-xl border border-fuchsia-100 px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">Periode: {row.period}</p>
                                            <p className="text-xs text-slate-500">{formatDateTime(row.dateValue)}</p>
                                            <p className="text-xs text-slate-700">Montant: {row.amount}</p>
                                        </div>
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                            row.status === 'paye'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : row.status === 'partiel'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : row.status === 'en_attente'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : row.status === 'annule'
                                                            ? 'bg-slate-200 text-slate-700'
                                                            : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {row.status}
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
