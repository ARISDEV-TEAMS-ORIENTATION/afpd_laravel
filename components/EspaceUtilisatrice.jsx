import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bell,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    Megaphone,
    RefreshCw,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AFPDLogo from './AFPDLogo';
import ProfileModal from './ProfileModal';
import ProfileAvatarBadge from './ProfileAvatarBadge';
import { API_BASE_URL, apiFetch, apiGet, clearAuthToken } from '../src/api';

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

const getEventParticipants = (event) => {
    if (Array.isArray(event?.participants)) return event.participants;
    if (Array.isArray(event?.inscriptions)) return event.inscriptions;
    if (Array.isArray(event?.adherentes)) return event.adherentes;
    return [];
};

const getEventParticipantsCount = (event) => {
    const directCount = Number(
        event?.participants_count ??
        event?.inscriptions_count ??
        event?.participantsCount ??
        event?.inscrits_count
    );
    if (!Number.isNaN(directCount) && directCount >= 0) return directCount;
    return getEventParticipants(event).length;
};

const getEventImageUrl = (event) => {
    const rawImage =
        event?.image_url ??
        event?.image ??
        event?.image_path ??
        event?.photo ??
        event?.media?.url ??
        event?.media_url;

    const imageValue = typeof rawImage === 'object'
        ? (rawImage?.url ?? rawImage?.path ?? rawImage?.original_url ?? '')
        : rawImage;

    if (!imageValue || typeof imageValue !== 'string') return '';
    if (/^https?:\/\//i.test(imageValue)) return imageValue;
    if (imageValue.startsWith('/')) return `${API_BASE_URL}${imageValue}`;
    if (imageValue.startsWith('storage/')) return `${API_BASE_URL}/${imageValue}`;
    if (imageValue.startsWith('public/')) return `${API_BASE_URL}/storage/${imageValue.replace(/^public\//, '')}`;
    if (imageValue.startsWith('uploads/')) return `${API_BASE_URL}/${imageValue}`;
    return `${API_BASE_URL}/storage/${imageValue}`;
};

const getEventStatusToken = (event) => normalizeToken(
    event?.statut ??
    event?.status ??
    event?.etat ??
    event?.state ??
    event?.validation_status ??
    event?.moderation_status
);

const isNotificationRead = (notification) => {
    const value = notification?.lu ?? notification?.read ?? notification?.is_read ?? notification?.read_at;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const token = normalizeToken(value);
        return ['1', 'true', 'yes', 'oui', 'lu', 'read'].includes(token);
    }
    return Boolean(value);
};

const getParticipantUserId = (participant) => (
    participant?.user_id ??
    participant?.id_user ??
    participant?.adherente_id ??
    participant?.participant_id ??
    participant?.user?.id ??
    participant?.id ??
    null
);

const getEventStartValue = (event) => (
    event?.date_debut ??
    event?.dateDebut ??
    event?.start_date ??
    event?.startDate ??
    event?.debut
);

const getEventEndValue = (event) => (
    event?.date_fin ??
    event?.dateFin ??
    event?.end_date ??
    event?.endDate ??
    event?.fin
);

const getEventStatusLabel = (event) => {
    const token = getEventStatusToken(event);
    if (token.includes('pending') || token.includes('attente')) return 'En attente';
    if (token.includes('rejete') || token.includes('refuse') || token.includes('rejected')) return 'Refusé';
    if (token.includes('annule') || token.includes('cancelled')) return 'Annulé';

    const startMs = parseDateMs(getEventStartValue(event));
    const now = Date.now();
    if (startMs && startMs > now) return 'À venir';
    if (startMs && startMs <= now) return 'En cours';
    return 'Planifié';
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
    if (value === null || value === undefined) return '-';
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return `${value}`;
    return `${parsed.toFixed(2)} F CFA`;
};

const getPaymentDateValue = (payment) => (
    payment?.date_paiement ??
    payment?.payment_date ??
    payment?.date ??
    payment?.paid_at ??
    payment?.created_at ??
    payment?.updated_at ??
    payment?.echeance ??
    payment?.due_date
);

const getPaymentAmountValue = (payment) => parseAmount(
    payment?.montant ??
    payment?.amount ??
    payment?.montant_cotisation ??
    payment?.montant_total ??
    payment?.total_amount
);

const getPaymentStatusKind = (payment) => {
    const token = normalizeToken(
        payment?.statut ??
        payment?.status ??
        payment?.etat ??
        payment?.payment_status ??
        payment?.state
    );
    if (token.includes('retard') || token.includes('late') || token.includes('overdue')) return 'late';
    if (token.includes('attente') || token.includes('pending')) return 'pending';
    if (token.includes('paye') || token.includes('paid') || token.includes('valide')) return 'paid';
    return 'unknown';
};

const isRegisteredToEvent = (event, userId) => {
    if (!userId) return false;
    const subscribedFlag =
        event?.is_inscrit ??
        event?.is_subscribed ??
        event?.inscrite ??
        event?.registered;
    if (typeof subscribedFlag === 'boolean') return subscribedFlag;
    if (typeof subscribedFlag === 'number') return subscribedFlag === 1;
    if (typeof subscribedFlag === 'string') {
        const token = normalizeToken(subscribedFlag);
        if (['1', 'true', 'yes', 'oui', 'inscrit', 'inscrite'].includes(token)) return true;
    }

    return getEventParticipants(event).some((participant) => `${getParticipantUserId(participant)}` === `${userId}`);
};

const EspaceUtilisatrice = () => {
    const navigate = useNavigate();
    const [me, setMe] = useState(null);
    const [annonces, setAnnonces] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [events, setEvents] = useState([]);
    const [payments, setPayments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
    const [processingEventId, setProcessingEventId] = useState(null);
    const [actionError, setActionError] = useState('');
    const [globalError, setGlobalError] = useState('');
    const [paymentsError, setPaymentsError] = useState('');
    const [selectedEvent, setSelectedEvent] = useState(null);

    const fetchData = useCallback(async ({ silent = false } = {}) => {
        if (silent) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setGlobalError('');
        setPaymentsError('');

        try {
            const [meRes, annoncesRes, notificationsRes, eventsRes, paymentsRes] = await Promise.all([
                apiGet('/api/me'),
                apiGet('/api/annonces?statut=publie'),
                apiGet('/api/notifications?all=1'),
                apiGet('/api/evenements'),
                apiGet('/api/me/cotisations').catch((error) => {
                    setPaymentsError(error?.message || 'Impossible de charger vos cotisations.');
                    return [];
                }),
            ]);

            setMe(toItem(meRes));
            setAnnonces(toList(annoncesRes));
            setNotifications(toList(notificationsRes));
            setEvents(toList(eventsRes));
            setPayments(toList(paymentsRes));
        } catch (error) {
            setGlobalError(error?.message || "Impossible de charger l'espace utilisatrice.");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const meId = me?.id ?? null;

    const eventRows = useMemo(() => {
        return events
            .map((event) => ({
                id: event?.id ?? event?.evenement_id ?? event?.event_id ?? null,
                title: event?.titre ?? event?.title ?? 'Sans titre',
                description: event?.description ?? event?.details ?? '',
                place: event?.lieu ?? event?.location ?? '-',
                startAt: getEventStartValue(event),
                endAt: getEventEndValue(event),
                statusLabel: getEventStatusLabel(event),
                participantsCount: getEventParticipantsCount(event),
                isRegistered: isRegisteredToEvent(event, meId),
                responsibleName:
                    `${event?.responsable?.nom ?? ''} ${event?.responsable?.prenom ?? ''}`.trim() ||
                    event?.responsable?.name ||
                    event?.responsable_nom ||
                    '-',
                imageUrl: getEventImageUrl(event),
                raw: event,
            }))
            .sort((a, b) => {
                const aMs = parseDateMs(a.startAt) ?? 0;
                const bMs = parseDateMs(b.startAt) ?? 0;
                return aMs - bMs;
            });
    }, [events, meId]);

    const selectedEventDetails = useMemo(() => {
        if (!selectedEvent?.id) return selectedEvent;
        const freshEvent = eventRows.find((event) => `${event.id}` === `${selectedEvent.id}`);
        return freshEvent || selectedEvent;
    }, [selectedEvent, eventRows]);

    const unreadNotifications = useMemo(
        () => notifications.filter((notification) => !isNotificationRead(notification)),
        [notifications]
    );

    const paymentRows = useMemo(() => {
        return payments
            .map((payment, index) => {
                const amountValue = getPaymentAmountValue(payment);
                const dateValue = getPaymentDateValue(payment);
                const statusKind = getPaymentStatusKind(payment);
                return {
                    id: payment?.id ?? `${dateValue ?? 'payment'}-${index}`,
                    period: payment?.periode ?? payment?.period ?? payment?.mois ?? payment?.month ?? '-',
                    amountLabel: formatAmount(amountValue),
                    statusKind,
                    statusLabel: statusKind === 'paid'
                        ? 'Payé'
                        : statusKind === 'late'
                            ? 'En retard'
                            : statusKind === 'pending'
                                ? 'En attente'
                                : 'Inconnu',
                    dateValue,
                };
            })
            .sort((a, b) => (parseDateMs(b.dateValue) ?? 0) - (parseDateMs(a.dateValue) ?? 0));
    }, [payments]);

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await apiFetch('/api/logout', { method: 'POST', credentials: 'include' });
        } catch (error) {
            console.error('Erreur lors de la déconnexion:', error);
        } finally {
            clearAuthToken();
            setIsLoggingOut(false);
            navigate('/');
        }
    };

    const handleMarkNotificationRead = async (notificationId) => {
        if (!notificationId) return;
        setActionError('');
        try {
            await apiFetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
            setNotifications((prev) => prev.map((item) => (
                item?.id === notificationId
                    ? { ...item, lu: true, read: true, is_read: true, read_at: item?.read_at || new Date().toISOString() }
                    : item
            )));
        } catch (error) {
            setActionError(error?.message || 'Impossible de marquer la notification comme lue.');
        }
    };

    const handleMarkAllRead = async () => {
        if (isMarkingAllRead) return;
        setIsMarkingAllRead(true);
        setActionError('');
        try {
            await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
            setNotifications((prev) => prev.map((item) => ({
                ...item,
                lu: true,
                read: true,
                is_read: true,
                read_at: item?.read_at || new Date().toISOString(),
            })));
        } catch (error) {
            setActionError(error?.message || 'Impossible de tout marquer comme lu.');
        } finally {
            setIsMarkingAllRead(false);
        }
    };

    const handleToggleInscription = async (eventRow, { closeDetails = false } = {}) => {
        if (!eventRow?.id || processingEventId) return;
        setProcessingEventId(eventRow.id);
        setActionError('');
        try {
            if (eventRow.isRegistered && meId) {
                await apiFetch(`/api/evenements/${eventRow.id}/inscriptions/${meId}`, { method: 'DELETE' });
            } else {
                await apiFetch(`/api/evenements/${eventRow.id}/inscriptions`, {
                    method: 'POST',
                    body: JSON.stringify({}),
                });
            }
            await fetchData({ silent: true });
            if (closeDetails) {
                setSelectedEvent(null);
            }
        } catch (error) {
            setActionError(error?.message || "L'inscription à l'activité a échoué.");
        } finally {
            setProcessingEventId(null);
        }
    };

    const handleOpenEventDetails = (eventRow) => {
        setSelectedEvent(eventRow);
    };

    const handleCloseEventDetails = () => {
        setSelectedEvent(null);
    };

    return (
        <div className="min-h-screen bg-[#FDF5FA]">
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-fuchsia-100">
                <div className="w-full px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <AFPDLogo compact showSubtitle={false} />
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Espace Utilisatrice</h1>
                            <p className="text-sm text-fuchsia-600">Annonces, notifications, activités et cotisations AFPD</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fetchData({ silent: true })}
                            disabled={isRefreshing}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-colors disabled:opacity-60"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Actualiser
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsProfileOpen(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-colors"
                        >
                            Mon profil
                        </button>
                        <ProfileAvatarBadge onClick={() => setIsProfileOpen(true)} />
                    </div>
                </div>
            </header>

            <main className="w-full px-6 py-6 space-y-6">
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Événements', value: eventRows.length, icon: CalendarDays },
                        { label: 'Annonces', value: annonces.length, icon: Megaphone },
                        { label: 'Notifications non lues', value: unreadNotifications.length, icon: Bell },
                        { label: 'Cotisations en retard', value: paymentRows.filter((payment) => payment.statusKind === 'late').length, icon: AlertTriangle },
                    ].map((item) => {
                        const Icon = item.icon;
                        return (
                            <article key={item.label} className="rounded-2xl border border-fuchsia-100 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">{item.label}</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{isLoading ? '-' : item.value}</p>
                                    </div>
                                    <div className="w-11 h-11 rounded-xl bg-fuchsia-50 text-fuchsia-700 flex items-center justify-center signal-icon">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>

                {(globalError || actionError) && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {globalError || actionError}
                    </div>
                )}
                {paymentsError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {paymentsError}
                    </div>
                )}

                <section className="grid gap-6 xl:grid-cols-[1.8fr_1.2fr] items-start">
                    <div className="rounded-2xl border border-fuchsia-100 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 mb-1">Activités de la plateforme</h2>
                        <p className="text-sm text-slate-500 mb-4">
                            Vous pouvez vous inscrire aux activités à venir directement depuis cette liste.
                        </p>
                        <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                            {isLoading && (
                                <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                    Chargement des activités...
                                </div>
                            )}
                            {!isLoading && eventRows.length === 0 && (
                                <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                    Aucune activité disponible.
                                </div>
                            )}
                            {!isLoading && eventRows.map((event) => (
                                <article key={event.id ?? `${event.title}-${event.startAt ?? ''}`} className="rounded-xl border border-fuchsia-100 px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                            {/* {event.imageUrl && (
                                                <img
                                                    src={event.imageUrl}
                                                    alt={event.title}
                                                    className="w-full max-w-xs h-28 object-cover rounded-lg border border-fuchsia-100 mb-1"
                                                    loading="lazy"
                                                />
                                            )} */}
                                            <p className="text-sm font-semibold text-slate-900 truncate">{event.title}</p>
                                            <p className="text-xs text-slate-500">
                                                {formatDateTime(event.startAt)} · {event.place}
                                            </p>
                                            <p className="text-xs text-slate-600">
                                                {event.description || 'Aucune description.'}
                                            </p>
                                            <div className="flex items-center gap-2 pt-1">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-fuchsia-100 text-fuchsia-700">
                                                    {event.statusLabel}
                                                </span>
                                                <span className="inline-flex items-center text-xs text-slate-500">
                                                    {event.participantsCount} inscrite(s)
                                                </span>
                                            </div>
                                        </div>
                                        {event.id && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEventDetails(event)}
                                                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50"
                                                >
                                                    Voir détails
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleInscription(event)}
                                                    disabled={processingEventId === event.id}
                                                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ${
                                                        event.isRegistered
                                                            ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                                                            : 'bg-fuchsia-700 text-white hover:bg-fuchsia-800'
                                                    }`}
                                                >
                                                    {processingEventId === event.id
                                                        ? '...'
                                                        : (event.isRegistered ? 'Se désinscrire' : "S'inscrire")}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <section className="rounded-2xl border border-fuchsia-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-bold text-gray-900">Annonces</h2>
                                <Megaphone className="w-4 h-4 text-fuchsia-600" />
                            </div>
                            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                                {isLoading && (
                                    <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 text-center">
                                        Chargement des annonces...
                                    </div>
                                )}
                                {!isLoading && annonces.length === 0 && (
                                    <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 text-center">
                                        Aucune annonce publiée.
                                    </div>
                                )}
                                {!isLoading && annonces.map((annonce, index) => (
                                    <article key={annonce?.id ?? `annonce-${index}`} className="rounded-xl border border-fuchsia-100 px-3 py-2">
                                        <p className="text-sm font-semibold text-slate-900">{annonce?.titre ?? 'Annonce'}</p>
                                        <p className="text-xs text-slate-600 mt-1">{annonce?.contenu ?? '-'}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {formatDateTime(annonce?.created_at ?? annonce?.updated_at)}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-fuchsia-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                                <button
                                    type="button"
                                    onClick={handleMarkAllRead}
                                    disabled={isMarkingAllRead || unreadNotifications.length === 0}
                                    className="px-2.5 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-xs font-semibold hover:bg-fuchsia-50 disabled:opacity-60"
                                >
                                    {isMarkingAllRead ? '...' : 'Tout lire'}
                                </button>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {isLoading && (
                                    <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 text-center">
                                        Chargement des notifications...
                                    </div>
                                )}
                                {!isLoading && notifications.length === 0 && (
                                    <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 text-center">
                                        Aucune notification.
                                    </div>
                                )}
                                {!isLoading && notifications.map((notification, index) => {
                                    const read = isNotificationRead(notification);
                                    return (
                                        <article
                                            key={notification?.id ?? `notification-${index}`}
                                            className={`rounded-xl border px-3 py-2 ${
                                                read ? 'border-slate-200 bg-white' : 'border-fuchsia-200 bg-fuchsia-50/50'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        {notification?.message ?? notification?.contenu ?? 'Notification'}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {formatDateTime(notification?.created_at ?? notification?.updated_at)}
                                                    </p>
                                                </div>
                                                {!read && notification?.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMarkNotificationRead(notification.id)}
                                                        className="text-xs font-semibold text-fuchsia-700 hover:text-fuchsia-800"
                                                    >
                                                        Lire
                                                    </button>
                                                )}
                                            </div>
                                            <div className="pt-1">
                                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                                    read ? 'text-emerald-700' : 'text-amber-700'
                                                }`}>
                                                    {read ? (
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <Clock3 className="w-3.5 h-3.5" />
                                                    )}
                                                    {read ? 'Lue' : 'Non lue'}
                                                </span>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-fuchsia-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-bold text-gray-900">Mes cotisations</h2>
                                <CircleDollarSign className="w-4 h-4 text-fuchsia-600" />
                            </div>
                            <p className="text-xs text-slate-500 mb-3">
                                Suivi des paiements effectués, en attente, ou en retard.
                            </p>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {isLoading && (
                                    <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 text-center">
                                        Chargement des cotisations...
                                    </div>
                                )}
                                {!isLoading && paymentRows.length === 0 && (
                                    <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 text-center">
                                        Aucune cotisation enregistrée.
                                    </div>
                                )}
                                {!isLoading && paymentRows.map((payment) => (
                                    <article key={payment.id} className="rounded-xl border border-fuchsia-100 px-3 py-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="space-y-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900">Période: {payment.period}</p>
                                                <p className="text-xs text-slate-500">{formatDateTime(payment.dateValue)}</p>
                                                <p className="text-xs text-slate-700">Montant: {payment.amountLabel}</p>
                                            </div>
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                payment.statusKind === 'paid'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : payment.statusKind === 'late'
                                                        ? 'bg-red-100 text-red-700'
                                                        : payment.statusKind === 'pending'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {payment.statusLabel}
                                            </span>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    </div>
                </section>
            </main>

            {selectedEventDetails && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white border border-fuchsia-100 shadow-xl">
                        <div className="flex items-start justify-between gap-3 p-5 border-b border-fuchsia-100">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900 truncate">
                                    {selectedEventDetails.title}
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {formatDateTime(selectedEventDetails.startAt)}
                                    {selectedEventDetails.endAt ? ` - ${formatDateTime(selectedEventDetails.endAt)}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseEventDetails}
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                                aria-label="Fermer les détails"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {selectedEventDetails.imageUrl && (
                                <img
                                    src={selectedEventDetails.imageUrl}
                                    alt={selectedEventDetails.title}
                                    className="w-full h-56 object-cover rounded-xl border border-fuchsia-100"
                                />
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
                                    <p className="text-xs text-slate-500">Lieu</p>
                                    <p className="text-sm font-semibold text-slate-900">{selectedEventDetails.place || '-'}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
                                    <p className="text-xs text-slate-500">Statut</p>
                                    <p className="text-sm font-semibold text-slate-900">{selectedEventDetails.statusLabel}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
                                    <p className="text-xs text-slate-500">Participantes</p>
                                    <p className="text-sm font-semibold text-slate-900">{selectedEventDetails.participantsCount}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
                                    <p className="text-xs text-slate-500">Responsable</p>
                                    <p className="text-sm font-semibold text-slate-900">{selectedEventDetails.responsibleName || '-'}</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 px-4 py-3">
                                <p className="text-xs text-slate-500 mb-1">Description</p>
                                <p className="text-sm text-slate-800 whitespace-pre-line">
                                    {selectedEventDetails.description || 'Aucune description disponible.'}
                                </p>
                            </div>
                        </div>

                        <div className="p-5 border-t border-fuchsia-100 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleCloseEventDetails}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold"
                            >
                                Fermer
                            </button>
                            <button
                                type="button"
                                onClick={() => handleToggleInscription(selectedEventDetails, { closeDetails: true })}
                                disabled={processingEventId === selectedEventDetails.id}
                                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                                    selectedEventDetails.isRegistered
                                        ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                                        : 'bg-fuchsia-700 text-white hover:bg-fuchsia-800'
                                }`}
                            >
                                {processingEventId === selectedEventDetails.id
                                    ? '...'
                                    : (selectedEventDetails.isRegistered ? 'Se désinscrire' : "S'inscrire")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
                onLogout={handleLogout}
            />
        </div>
    );
};

export default EspaceUtilisatrice;
