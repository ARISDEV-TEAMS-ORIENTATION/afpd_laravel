import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarClock,
    Clock3,
    LoaderCircle,
    MapPin,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Users,
    Wifi,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AFPDLogo from './AFPDLogo';
import ProfileModal from './ProfileModal';
import ProfileAvatarBadge from './ProfileAvatarBadge';
import { apiFetch, apiGet, apiPostForm, API_BASE_URL, clearAuthToken } from '../src/api';

const AUTO_REFRESH_MS = 20_000;

const EMPTY_FORM = {
    id: null,
    titre: '',
    description: '',
    date_debut: '',
    date_fin: '',
    lieu: '',
    id_responsable: '',
    image: null,
};

const toList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const toSingle = (payload) => {
    if (!payload) return null;
    if (Array.isArray(payload?.data)) return null;
    if (payload?.data && typeof payload.data === 'object') return payload.data;
    if (typeof payload === 'object') return payload;
    return null;
};

const parseDateMs = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const toInputDateTime = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        const asString = String(value);
        return asString.length >= 16 ? asString.slice(0, 16) : '';
    }
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
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

const normalizeText = (value) => (
    (value ?? '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
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

const getParticipants = (event) => {
    if (Array.isArray(event?.participants)) return event.participants;
    if (Array.isArray(event?.inscriptions)) return event.inscriptions;
    if (Array.isArray(event?.adherentes)) return event.adherentes;
    if (Array.isArray(event?.participants_data)) return event.participants_data;
    if (Array.isArray(event?.inscriptions_data)) return event.inscriptions_data;
    return [];
};

const getParticipantsCount = (event) => {
    const explicitCount =
        event?.participants_count ??
        event?.inscriptions_count ??
        event?.participantsCount ??
        event?.inscrits_count ??
        event?.count_participants;

    const numberValue = Number(explicitCount);
    if (!Number.isNaN(numberValue) && numberValue >= 0) return numberValue;
    return getParticipants(event).length;
};

const getEventStatusToken = (event) =>
    normalizeText(
        event?.statut ??
        event?.status ??
        event?.etat ??
        event?.state ??
        event?.validation_status ??
        event?.moderation_status
    );

const toBoolFlag = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const token = normalizeText(value);
        if (['1', 'true', 'yes', 'oui'].includes(token)) return true;
        if (['0', 'false', 'no', 'non'].includes(token)) return false;
    }
    return null;
};

const isEventRejected = (event) => {
    const rejectedFlag = toBoolFlag(event?.is_rejected ?? event?.rejected ?? event?.is_refused ?? event?.refused);
    if (rejectedFlag === true) return true;
    const statusToken = getEventStatusToken(event);
    return ['rejete', 'rejected', 'refuse', 'declined'].some((label) => statusToken.includes(label));
};

const isEventValidated = (event) => {
    const validatedFlag = toBoolFlag(event?.is_validated ?? event?.validated ?? event?.valide ?? event?.is_approved ?? event?.approved);
    if (validatedFlag === true) return true;
    const statusToken = getEventStatusToken(event);
    return ['valide', 'validated', 'approve', 'approuve', 'publie', 'published', 'actif', 'active'].some((label) =>
        statusToken.includes(label)
    );
};

const isEventPending = (event) => {
    const pendingFlag = toBoolFlag(event?.is_pending ?? event?.pending ?? event?.en_attente ?? event?.submitted_for_validation);
    if (pendingFlag === true) return true;
    if (isEventRejected(event) || isEventValidated(event)) return false;
    const statusToken = getEventStatusToken(event);
    return ['pending', 'attente', 'review', 'moderation', 'draft', 'propose', 'submitted'].some((label) =>
        statusToken.includes(label)
    );
};

const getEventStatus = (event, nowMs = Date.now()) => {
    if (isEventRejected(event)) return 'rejected';
    if (isEventPending(event)) return 'pending';

    const raw = getEventStatusToken(event);
    if (raw.includes('annul')) return 'cancelled';
    if (raw.includes('termine') || raw.includes('ended') || raw.includes('fini')) return 'ended';
    if (raw.includes('live') || raw.includes('encours') || raw.includes('en cours')) return 'live';
    if (raw.includes('avenir') || raw.includes('upcoming') || raw.includes('planifie')) return 'upcoming';

    if (!isEventValidated(event)) {
        // Tant que l'admin ne valide pas, l'evenement reste en attente.
        return 'pending';
    }

    const startMs = parseDateMs(getEventStartValue(event));
    const endMs = parseDateMs(getEventEndValue(event));

    if (startMs && nowMs < startMs) return 'upcoming';
    if (startMs && endMs && nowMs >= startMs && nowMs <= endMs) return 'live';
    if (startMs && !endMs && nowMs >= startMs) return 'live';
    if (endMs && nowMs > endMs) return 'ended';
    return 'upcoming';
};

const getEventImageUrl = (event) => {
    const imageValue = event?.image_url ?? event?.image ?? event?.image_path ?? event?.photo;
    if (!imageValue) return '';

    if (typeof imageValue !== 'string') return '';
    if (/^https?:\/\//i.test(imageValue)) return imageValue;

    if (imageValue.startsWith('/')) {
        return `${API_BASE_URL}${imageValue}`;
    }

    if (imageValue.startsWith('storage/')) {
        return `${API_BASE_URL}/${imageValue}`;
    }

    return `${API_BASE_URL}/storage/${imageValue}`;
};

const getParticipantName = (participant) => {
    const fullName = `${participant?.nom ?? participant?.last_name ?? ''} ${participant?.prenom ?? participant?.first_name ?? ''}`.trim();
    if (fullName) return fullName;
    return participant?.name ?? participant?.email ?? '-';
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

const getParticipantPresence = (participant) => {
    const raw =
        participant?.presence ??
        participant?.is_present ??
        participant?.present ??
        participant?.is_presente;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw === 1;
    if (typeof raw === 'string') {
        const token = normalizeText(raw);
        return ['1', 'true', 'oui', 'yes', 'present', 'presente'].includes(token);
    }
    return false;
};

const CommunityManagerDashboard = () => {
    const navigate = useNavigate();

    const [events, setEvents] = useState([]);
    const [users, setUsers] = useState([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(true);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [eventsError, setEventsError] = useState('');
    const [usersError, setUsersError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortOption, setSortOption] = useState('start_asc');
    const [lastSyncAt, setLastSyncAt] = useState(null);

    const [formMode, setFormMode] = useState('create');
    const [eventForm, setEventForm] = useState(EMPTY_FORM);
    const [isSavingEvent, setIsSavingEvent] = useState(false);
    const [saveError, setSaveError] = useState('');

    const [deletingEventId, setDeletingEventId] = useState(null);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [selectedEventDetails, setSelectedEventDetails] = useState(null);
    const [selectedParticipantsData, setSelectedParticipantsData] = useState(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState('');
    const [participantsError, setParticipantsError] = useState('');
    const [presenceActionError, setPresenceActionError] = useState('');
    const [updatingPresenceUserId, setUpdatingPresenceUserId] = useState(null);

    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const usersById = useMemo(() => {
        const map = new Map();
        users.forEach((user) => {
            if (user?.id === null || user?.id === undefined) return;
            map.set(`${user.id}`, user);
        });
        return map;
    }, [users]);

    const fetchEvents = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setIsLoadingEvents(true);
        setEventsError('');

        try {
            const response = await apiGet('/api/evenements');
            const list = toList(response);
            setEvents(list);
            setLastSyncAt(new Date());
            return list;
        } catch (error) {
            setEventsError("Impossible de charger les evenements.");
            return [];
        } finally {
            if (!silent) setIsLoadingEvents(false);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        setIsLoadingUsers(true);
        setUsersError('');

        try {
            const response = await apiGet('/api/users');
            const list = toList(response).filter((user) => normalizeText(user?.statut) !== 'pending');
            setUsers(list);
        } catch (error) {
            setUsersError("Impossible de charger les responsables.");
        } finally {
            setIsLoadingUsers(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
        fetchUsers();

        const refreshInterval = setInterval(() => {
            fetchEvents({ silent: true });
        }, AUTO_REFRESH_MS);

        return () => clearInterval(refreshInterval);
    }, [fetchEvents, fetchUsers]);

    const loadEventDetails = useCallback(async (eventId, fallbackEvent = null) => {
        if (eventId === null || eventId === undefined || eventId === '') {
            setSelectedEventDetails(null);
            setSelectedParticipantsData(null);
            return;
        }

        const normalizedId = String(eventId);
        setSelectedEventId(normalizedId);
        setIsLoadingDetails(true);
        setDetailsError('');
        setParticipantsError('');
        setPresenceActionError('');
        if (fallbackEvent) {
            setSelectedEventDetails(fallbackEvent);
            setSelectedParticipantsData(getParticipants(fallbackEvent));
        }

        try {
            const [eventResponse, participantsResponse] = await Promise.allSettled([
                apiGet(`/api/evenements/${normalizedId}`),
                apiGet(`/api/evenements/${normalizedId}/participants`),
            ]);

            if (eventResponse.status === 'fulfilled') {
                const event = toSingle(eventResponse.value);
                if (event) {
                    setSelectedEventDetails(event);
                } else if (!fallbackEvent) {
                    setSelectedEventDetails(null);
                }
            } else if (!fallbackEvent) {
                setDetailsError("Impossible de charger le detail de l'evenement.");
            }

            if (participantsResponse.status === 'fulfilled') {
                setSelectedParticipantsData(toList(participantsResponse.value));
            } else if (!fallbackEvent) {
                setSelectedParticipantsData([]);
                setParticipantsError("Impossible de charger les participantes.");
            }
        } catch {
            if (!fallbackEvent) {
                setDetailsError("Impossible de charger le detail de l'evenement.");
                setSelectedParticipantsData([]);
            }
        } finally {
            setIsLoadingDetails(false);
        }
    }, []);

    const enrichEvent = useCallback((event) => {
        const startValue = getEventStartValue(event);
        const endValue = getEventEndValue(event);
        const startMs = parseDateMs(startValue);
        const endMs = parseDateMs(endValue);

        const userId =
            event?.id_responsable ??
            event?.responsable_id ??
            event?.user_id ??
            event?.responsable?.id ??
            null;

        const linkedUser = userId !== null && userId !== undefined ? usersById.get(`${userId}`) : null;

        const title = event?.titre ?? event?.title ?? 'Sans titre';
        const place = event?.lieu ?? event?.location ?? '-';
        const participantsCount = getParticipantsCount(event);

        const responsibleName =
            `${event?.responsable?.nom ?? linkedUser?.nom ?? ''} ${event?.responsable?.prenom ?? linkedUser?.prenom ?? ''}`.trim() ||
            event?.responsable?.name ||
            linkedUser?.name ||
            linkedUser?.email ||
            '-';

        return {
            raw: event,
            id: event?.id !== null && event?.id !== undefined ? String(event.id) : null,
            title,
            description: event?.description ?? event?.details ?? '',
            place,
            startValue,
            endValue,
            startMs,
            endMs,
            createdAtMs: parseDateMs(event?.created_at ?? event?.createdAt),
            status: getEventStatus(event),
            participantsCount,
            responsibleName,
            imageUrl: getEventImageUrl(event),
        };
    }, [usersById]);

    const eventRows = useMemo(() => events.map(enrichEvent), [events, enrichEvent]);

    const filteredEvents = useMemo(() => {
        const query = normalizeText(searchQuery);

        const filtered = eventRows.filter((event) => {
            const matchesSearch = !query ||
                normalizeText(event.title).includes(query) ||
                normalizeText(event.place).includes(query) ||
                normalizeText(event.responsibleName).includes(query);

            const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
            return matchesSearch && matchesStatus;
        });

        return filtered.sort((a, b) => {
            if (sortOption === 'participants_desc') {
                return b.participantsCount - a.participantsCount;
            }
            if (sortOption === 'participants_asc') {
                return a.participantsCount - b.participantsCount;
            }
            if (sortOption === 'created_desc') {
                if (!a.createdAtMs && !b.createdAtMs) return 0;
                if (!a.createdAtMs) return 1;
                if (!b.createdAtMs) return -1;
                return b.createdAtMs - a.createdAtMs;
            }
            if (sortOption === 'start_desc') {
                if (!a.startMs && !b.startMs) return 0;
                if (!a.startMs) return 1;
                if (!b.startMs) return -1;
                return b.startMs - a.startMs;
            }

            if (!a.startMs && !b.startMs) return 0;
            if (!a.startMs) return 1;
            if (!b.startMs) return -1;
            return a.startMs - b.startMs;
        });
    }, [eventRows, searchQuery, statusFilter, sortOption]);

    const stats = useMemo(() => {
        const counters = {
            total: eventRows.length,
            pending: 0,
            upcoming: 0,
            live: 0,
            ended: 0,
            participants: 0,
        };

        eventRows.forEach((event) => {
            counters.participants += event.participantsCount;
            if (event.status === 'pending') counters.pending += 1;
            if (event.status === 'upcoming') counters.upcoming += 1;
            if (event.status === 'live') counters.live += 1;
            if (event.status === 'ended') counters.ended += 1;
        });

        return counters;
    }, [eventRows]);

    const selectedEvent = useMemo(() => {
        if (!selectedEventId) return null;
        return eventRows.find((event) => event.id === selectedEventId) || null;
    }, [eventRows, selectedEventId]);

    const selectedDetailsSource = selectedEventDetails || selectedEvent?.raw || null;
    const selectedParticipants = useMemo(() => {
        if (Array.isArray(selectedParticipantsData)) return selectedParticipantsData;
        return getParticipants(selectedDetailsSource);
    }, [selectedDetailsSource, selectedParticipantsData]);

    const resetForm = () => {
        setEventForm(EMPTY_FORM);
        setFormMode('create');
        setSaveError('');
    };

    const startCreateMode = () => {
        setFormMode('create');
        setSaveError('');
        setEventForm(EMPTY_FORM);
    };

    const startEditMode = (eventRow) => {
        const source = eventRow?.raw;
        if (!source) return;

        setFormMode('edit');
        setSaveError('');
        setEventForm({
            id: source?.id !== null && source?.id !== undefined ? String(source.id) : null,
            titre: source?.titre ?? source?.title ?? '',
            description: source?.description ?? source?.details ?? '',
            date_debut: toInputDateTime(getEventStartValue(source)),
            date_fin: toInputDateTime(getEventEndValue(source)),
            lieu: source?.lieu ?? source?.location ?? '',
            id_responsable: source?.id_responsable ?? source?.responsable_id ?? source?.user_id ?? '',
            image: null,
        });

        if (source?.id) {
            loadEventDetails(source.id, source);
        }
    };

    const handleEventFieldChange = (field, value) => {
        setEventForm((prev) => ({ ...prev, [field]: value }));
    };

    const validateEventForm = () => {
        if (!eventForm.titre.trim()) return "Le titre de l'evenement est requis.";
        if (!eventForm.date_debut) return 'La date de debut est requise.';

        const startMs = parseDateMs(eventForm.date_debut);
        const endMs = parseDateMs(eventForm.date_fin);
        if (startMs && endMs && endMs < startMs) {
            return 'La date de fin doit etre superieure ou egale a la date de debut.';
        }

        if (formMode === 'create' && !(eventForm.image instanceof File)) {
            return "L'image de l'evenement est requise a la creation.";
        }

        return '';
    };

    const buildEventFormData = () => {
        const payload = new FormData();

        payload.append('titre', eventForm.titre.trim());
        payload.append('date_debut', eventForm.date_debut);

        if (eventForm.description.trim()) {
            payload.append('description', eventForm.description.trim());
        }

        if (eventForm.date_fin) {
            payload.append('date_fin', eventForm.date_fin);
        }

        if (eventForm.lieu.trim()) {
            payload.append('lieu', eventForm.lieu.trim());
        }

        if (eventForm.id_responsable) {
            payload.append('id_responsable', String(eventForm.id_responsable));
        }

        if (eventForm.image instanceof File) {
            payload.append('image', eventForm.image);
        }

        return payload;
    };

    const handleSaveEvent = async (e) => {
        e.preventDefault();
        if (isSavingEvent) return;

        const validationError = validateEventForm();
        if (validationError) {
            setSaveError(validationError);
            return;
        }

        setIsSavingEvent(true);
        setSaveError('');

        try {
            const payload = buildEventFormData();
            let response;

            if (formMode === 'edit' && eventForm.id) {
                payload.append('_method', 'PATCH');
                response = await apiPostForm(`/api/evenements/${eventForm.id}`, payload);
            } else {
                response = await apiPostForm('/api/evenements', payload);
            }

            const refreshedEvents = await fetchEvents();

            const updatedEvent = toSingle(response);
            const persistedEventId = updatedEvent?.id ?? eventForm.id ?? null;

            if (persistedEventId) {
                const fallbackFromList = refreshedEvents.find((event) => String(event?.id) === String(persistedEventId)) ?? null;
                await loadEventDetails(persistedEventId, updatedEvent || fallbackFromList);
            }

            if (formMode === 'edit') {
                setFormMode('create');
            }

            setEventForm(EMPTY_FORM);
        } catch (error) {
            const message = error?.body?.message ??
                error?.body?.error ??
                "Impossible d'enregistrer l'evenement.";
            setSaveError(message);
        } finally {
            setIsSavingEvent(false);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        if (!eventId || deletingEventId) return;

        const shouldDelete = window.confirm("Supprimer cet evenement ? Cette action est irreversible.");
        if (!shouldDelete) return;

        setDeletingEventId(eventId);

        try {
            await apiFetch(`/api/evenements/${eventId}`, { method: 'DELETE' });
            await fetchEvents();

            if (selectedEventId === String(eventId)) {
                setSelectedEventId(null);
                setSelectedEventDetails(null);
                setSelectedParticipantsData(null);
                setDetailsError('');
                setParticipantsError('');
            }

            if (eventForm.id === String(eventId)) {
                resetForm();
            }
        } catch (error) {
            setEventsError("La suppression de l'evenement a echoue.");
        } finally {
            setDeletingEventId(null);
        }
    };

    const handleTogglePresence = async (participant, nextPresence) => {
        if (!selectedEventId) return;
        const userId = getParticipantUserId(participant);
        if (!userId || updatingPresenceUserId) return;

        const participantKey = String(userId);
        setUpdatingPresenceUserId(participantKey);
        setPresenceActionError('');
        try {
            await apiFetch(`/api/evenements/${selectedEventId}/participants/${participantKey}/presence`, {
                method: 'PATCH',
                body: JSON.stringify({ presence: nextPresence }),
            });
            setSelectedParticipantsData((prev) => {
                if (!Array.isArray(prev)) return prev;
                return prev.map((item) => {
                    const currentId = getParticipantUserId(item);
                    if (`${currentId}` !== participantKey) return item;
                    return {
                        ...item,
                        presence: nextPresence,
                        is_present: nextPresence,
                    };
                });
            });
        } catch (error) {
            setPresenceActionError(error?.message || 'La mise a jour de presence a echoue.');
        } finally {
            setUpdatingPresenceUserId(null);
        }
    };

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);

        try {
            await apiFetch('/api/logout', { method: 'POST', credentials: 'include' });
        } catch (error) {
            console.error('Erreur lors de la deconnexion:', error);
        } finally {
            clearAuthToken();
            setIsLoggingOut(false);
            navigate('/');
        }
    };

    const statusBadgeClass = (status) => {
        if (status === 'pending') return 'bg-amber-100 text-amber-700';
        if (status === 'upcoming') return 'bg-indigo-100 text-indigo-700';
        if (status === 'live') return 'bg-emerald-100 text-emerald-700';
        if (status === 'ended') return 'bg-slate-100 text-slate-700';
        if (status === 'rejected') return 'bg-rose-100 text-rose-700';
        if (status === 'cancelled') return 'bg-rose-100 text-rose-700';
        return 'bg-fuchsia-100 text-fuchsia-700';
    };

    const statusLabel = (status) => {
        if (status === 'pending') return 'En attente';
        if (status === 'upcoming') return 'A venir';
        if (status === 'live') return 'En cours';
        if (status === 'ended') return 'Termine';
        if (status === 'rejected') return 'Rejete';
        if (status === 'cancelled') return 'Annule';
        return 'Planifie';
    };

    const selectedImagePreviewUrl = useMemo(() => {
        if (eventForm.image instanceof File) {
            return URL.createObjectURL(eventForm.image);
        }

        if (formMode === 'edit' && selectedEvent) {
            return selectedEvent.imageUrl;
        }

        return '';
    }, [eventForm.image, formMode, selectedEvent]);

    useEffect(() => {
        return () => {
            if (selectedImagePreviewUrl && selectedImagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(selectedImagePreviewUrl);
            }
        };
    }, [selectedImagePreviewUrl]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff4fb] via-[#fdf7ff] to-[#fff8fc]">
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-fuchsia-100">
                <div className="w-full px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <AFPDLogo compact showSubtitle={false} />
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Espace Community Manager</h1>
                            <p className="text-sm text-fuchsia-600">Creation et suivi des evenements en temps reel</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fetchEvents()}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
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
                <section className="rounded-2xl border border-fuchsia-100 bg-white p-4 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                    <span className="inline-flex items-center gap-2 rounded-full bg-fuchsia-50 px-3 py-1 text-fuchsia-700 font-medium">
                        <Wifi className="w-4 h-4" />
                        Sync auto toutes les {Math.floor(AUTO_REFRESH_MS / 1000)} secondes
                    </span>
                    <span className="inline-flex items-center gap-2 text-slate-500">
                        <Clock3 className="w-4 h-4" />
                        Derniere synchro: {lastSyncAt ? lastSyncAt.toLocaleTimeString('fr-FR') : '-'}
                    </span>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                    {[
                        { label: 'Evenements total', value: stats.total, icon: CalendarClock },
                        { label: 'En attente', value: stats.pending, icon: Clock3 },
                        { label: 'A venir', value: stats.upcoming, icon: Clock3 },
                        { label: 'En cours', value: stats.live, icon: Wifi },
                        { label: 'Termines', value: stats.ended, icon: CalendarClock },
                        { label: 'Inscriptions', value: stats.participants, icon: Users },
                    ].map((item) => {
                        const Icon = item.icon;
                        return (
                            <article key={item.label} className="rounded-2xl border border-fuchsia-100 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">{item.label}</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{item.value}</p>
                                    </div>
                                    <div className="w-11 h-11 rounded-xl bg-fuchsia-50 text-fuchsia-700 flex items-center justify-center signal-icon">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr] items-start">
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-fuchsia-100 bg-white p-4">
                            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                <label className="relative flex-1">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fuchsia-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Rechercher un evenement, un lieu, un responsable..."
                                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-fuchsia-200 focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none"
                                    />
                                </label>

                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-3 py-2.5 rounded-xl border border-fuchsia-200 bg-white text-slate-700"
                                >
                                    <option value="all">Tous les statuts</option>
                                    <option value="pending">En attente</option>
                                    <option value="upcoming">A venir</option>
                                    <option value="live">En cours</option>
                                    <option value="ended">Termines</option>
                                    <option value="rejected">Rejetes</option>
                                    <option value="cancelled">Annules</option>
                                </select>

                                <select
                                    value={sortOption}
                                    onChange={(e) => setSortOption(e.target.value)}
                                    className="px-3 py-2.5 rounded-xl border border-fuchsia-200 bg-white text-slate-700"
                                >
                                    <option value="start_asc">Date debut (proche)</option>
                                    <option value="start_desc">Date debut (recent)</option>
                                    <option value="participants_desc">Plus d'inscriptions</option>
                                    <option value="participants_asc">Moins d'inscriptions</option>
                                    <option value="created_desc">Creation recente</option>
                                </select>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-fuchsia-100 bg-white shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[920px]">
                                    <thead className="bg-fuchsia-50/60 border-b border-fuchsia-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Evenement</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Debut</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fin</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Lieu</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Responsable</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Inscriptions</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Statut</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-fuchsia-100/70">
                                        {isLoadingEvents && (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                                                    <span className="inline-flex items-center gap-2">
                                                        <LoaderCircle className="w-4 h-4 animate-spin" />
                                                        Chargement des evenements...
                                                    </span>
                                                </td>
                                            </tr>
                                        )}

                                        {!isLoadingEvents && eventsError && (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-8 text-center text-red-600">
                                                    {eventsError}
                                                </td>
                                            </tr>
                                        )}

                                        {!isLoadingEvents && !eventsError && filteredEvents.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                                                    Aucun evenement pour ce filtre.
                                                </td>
                                            </tr>
                                        )}

                                        {!isLoadingEvents && !eventsError && filteredEvents.map((event) => (
                                            <tr key={event.id ?? `${event.title}-${event.startValue}`} className="hover:bg-fuchsia-50/40">
                                                <td className="px-4 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => loadEventDetails(event.id, event.raw)}
                                                        className="text-left"
                                                    >
                                                        <p className="font-semibold text-slate-900">{event.title}</p>
                                                        <p className="text-xs text-slate-500 line-clamp-1 max-w-[220px]">
                                                            {event.description || 'Aucune description'}
                                                        </p>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(event.startValue)}</td>
                                                <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(event.endValue)}</td>
                                                <td className="px-4 py-3 text-sm text-slate-700">
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="w-3.5 h-3.5 text-fuchsia-500" />
                                                        {event.place || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-700">{event.responsibleName}</td>
                                                <td className="px-4 py-3 text-sm font-semibold text-fuchsia-700">{event.participantsCount}</td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(event.status)}`}>
                                                        {statusLabel(event.status)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditMode(event)}
                                                            className="p-2 rounded-lg border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50"
                                                            aria-label="Modifier"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteEvent(event.id)}
                                                            disabled={deletingEventId === event.id}
                                                            className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                                                            aria-label="Supprimer"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-fuchsia-100 bg-white p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-slate-900">Inscriptions de l'evenement selectionne</h3>
                                {selectedEvent && (
                                    <button
                                        type="button"
                                        onClick={() => loadEventDetails(selectedEvent.id, selectedEvent.raw)}
                                        className="text-sm text-fuchsia-700 hover:text-fuchsia-800"
                                    >
                                        Recharger
                                    </button>
                                )}
                            </div>

                            {!selectedEventId && (
                                <p className="text-sm text-slate-500">Choisissez un evenement pour afficher les adherents inscrits.</p>
                            )}

                            {selectedEventId && isLoadingDetails && (
                                <p className="text-sm text-slate-500 inline-flex items-center gap-2">
                                    <LoaderCircle className="w-4 h-4 animate-spin" />
                                    Chargement des inscriptions...
                                </p>
                            )}

                            {selectedEventId && !isLoadingDetails && detailsError && (
                                <p className="text-sm text-red-600">{detailsError}</p>
                            )}
                            {selectedEventId && !isLoadingDetails && participantsError && (
                                <p className="text-sm text-red-600">{participantsError}</p>
                            )}
                            {selectedEventId && !isLoadingDetails && presenceActionError && (
                                <p className="text-sm text-red-600">{presenceActionError}</p>
                            )}

                            {selectedEventId && !isLoadingDetails && !detailsError && (
                                <div className="space-y-3">
                                    <div className="rounded-xl bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-800">
                                        <span className="font-semibold">{selectedEvent?.title ?? selectedDetailsSource?.titre ?? 'Evenement'}</span>
                                        {' · '}
                                        {selectedParticipants.length} inscrite(s)
                                    </div>

                                    {selectedParticipants.length === 0 && (
                                        <p className="text-sm text-slate-500">Aucune inscription enregistree pour le moment.</p>
                                    )}

                                    {selectedParticipants.length > 0 && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[520px]">
                                                <thead>
                                                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-fuchsia-100">
                                                        <th className="py-2 pr-4">Adherente</th>
                                                        <th className="py-2 pr-4">Email</th>
                                                        <th className="py-2 pr-4">Telephone</th>
                                                        <th className="py-2">Date inscription</th>
                                                        <th className="py-2 pl-4">Presence</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-fuchsia-100/70">
                                                    {selectedParticipants.map((participant, index) => (
                                                        <tr key={participant?.id ?? participant?.user_id ?? `${participant?.email ?? 'p'}-${index}`}>
                                                            <td className="py-2 pr-4 text-sm text-slate-700">{getParticipantName(participant)}</td>
                                                            <td className="py-2 pr-4 text-sm text-slate-600">{participant?.email ?? '-'}</td>
                                                            <td className="py-2 pr-4 text-sm text-slate-600">{participant?.telephone ?? participant?.phone ?? '-'}</td>
                                                            <td className="py-2 text-sm text-slate-600">{formatDateTime(participant?.created_at ?? participant?.date_inscription ?? participant?.registered_at)}</td>
                                                            <td className="py-2 pl-4 text-sm text-slate-700">
                                                                {getParticipantUserId(participant) ? (
                                                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={getParticipantPresence(participant)}
                                                                            onChange={(e) => handleTogglePresence(participant, e.target.checked)}
                                                                            disabled={updatingPresenceUserId === String(getParticipantUserId(participant))}
                                                                            className="h-4 w-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                                                        />
                                                                        <span className="text-xs text-slate-600">
                                                                            {updatingPresenceUserId === String(getParticipantUserId(participant))
                                                                                ? 'Maj...'
                                                                                : (getParticipantPresence(participant) ? 'Présente' : 'Absente')}
                                                                        </span>
                                                                    </label>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400">N/A</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <aside className="rounded-2xl border border-fuchsia-100 bg-white p-5 shadow-sm sticky top-24">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900">
                                {formMode === 'edit' ? "Modifier l'evenement" : 'Nouvel evenement'}
                            </h3>
                            {formMode === 'edit' ? (
                                <button
                                    type="button"
                                    onClick={startCreateMode}
                                    className="text-sm text-fuchsia-700 hover:text-fuchsia-800"
                                >
                                    Annuler edition
                                </button>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-fuchsia-700 bg-fuchsia-50 px-2 py-1 rounded-full">
                                    <Plus className="w-3.5 h-3.5" />
                                    Temps reel
                                </span>
                            )}
                        </div>

                        <form onSubmit={handleSaveEvent} className="space-y-4">
                            <div>
                                <label htmlFor="event-title" className="block text-sm font-medium text-slate-700 mb-1.5">Titre</label>
                                <input
                                    id="event-title"
                                    type="text"
                                    value={eventForm.titre}
                                    onChange={(e) => handleEventFieldChange('titre', e.target.value)}
                                    className="w-full rounded-xl border border-fuchsia-200 px-3 py-2.5 focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none"
                                    placeholder="Ex: Atelier design inclusif"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="event-description" className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                                <textarea
                                    id="event-description"
                                    rows={4}
                                    value={eventForm.description}
                                    onChange={(e) => handleEventFieldChange('description', e.target.value)}
                                    className="w-full rounded-xl border border-fuchsia-200 px-3 py-2.5 focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none resize-y"
                                    placeholder="Detaillez le programme de l'evenement..."
                                />
                            </div>

                            <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="event-start" className="block text-sm font-medium text-slate-700 mb-1.5">Date debut</label>
                                    <input
                                        id="event-start"
                                        type="datetime-local"
                                        value={eventForm.date_debut}
                                        onChange={(e) => handleEventFieldChange('date_debut', e.target.value)}
                                        className="w-full rounded-xl border border-fuchsia-200 px-3 py-2.5 focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="event-end" className="block text-sm font-medium text-slate-700 mb-1.5">Date fin</label>
                                    <input
                                        id="event-end"
                                        type="datetime-local"
                                        value={eventForm.date_fin}
                                        onChange={(e) => handleEventFieldChange('date_fin', e.target.value)}
                                        className="w-full rounded-xl border border-fuchsia-200 px-3 py-2.5 focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="event-place" className="block text-sm font-medium text-slate-700 mb-1.5">Lieu</label>
                                <input
                                    id="event-place"
                                    type="text"
                                    value={eventForm.lieu}
                                    onChange={(e) => handleEventFieldChange('lieu', e.target.value)}
                                    className="w-full rounded-xl border border-fuchsia-200 px-3 py-2.5 focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none"
                                    placeholder="Hybride / Salle polyvalente / En ligne"
                                />
                            </div>

                            <div>
                                <label htmlFor="event-manager" className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
                                <select
                                    id="event-manager"
                                    value={eventForm.id_responsable}
                                    onChange={(e) => handleEventFieldChange('id_responsable', e.target.value)}
                                    className="w-full rounded-xl border border-fuchsia-200 px-3 py-2.5 bg-white focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500 outline-none"
                                >
                                    <option value="">Aucun responsable</option>
                                    {users.map((user) => {
                                        const fullName = `${user?.nom ?? ''} ${user?.prenom ?? ''}`.trim() || user?.email;
                                        return (
                                            <option key={user.id} value={user.id}>
                                                {fullName}
                                            </option>
                                        );
                                    })}
                                </select>
                                {usersError && (
                                    <p className="text-xs text-red-600 mt-1">{usersError}</p>
                                )}
                                {isLoadingUsers && (
                                    <p className="text-xs text-slate-500 mt-1">Chargement des responsables...</p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="event-image" className="block text-sm font-medium text-slate-700 mb-1.5">Affiche evenement</label>
                                <input
                                    id="event-image"
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleEventFieldChange('image', e.target.files?.[0] ?? null)}
                                    className="block w-full text-sm text-slate-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-fuchsia-100 file:text-fuchsia-700 hover:file:bg-fuchsia-200"
                                />
                                <p className="text-xs text-slate-500 mt-1">Format image, max 5MB. Requis a la creation.</p>
                            </div>

                            {selectedImagePreviewUrl && (
                                <div className="rounded-xl overflow-hidden border border-fuchsia-100">
                                    <img
                                        src={selectedImagePreviewUrl}
                                        alt="Apercu evenement"
                                        className="w-full h-40 object-cover"
                                    />
                                </div>
                            )}

                            {saveError && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {saveError}
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={isSavingEvent}
                                    className="flex-1 inline-flex justify-center items-center gap-2 px-3 py-2.5 rounded-xl bg-fuchsia-700 text-white hover:bg-fuchsia-800 transition-colors disabled:opacity-60"
                                >
                                    {isSavingEvent ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    {formMode === 'edit' ? 'Mettre a jour' : 'Publier'}
                                </button>

                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-3 py-2.5 rounded-xl border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50"
                                >
                                    Reinit.
                                </button>
                            </div>
                        </form>
                    </aside>
                </section>
            </main>

            <ProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
                onLogout={handleLogout}
            />
        </div>
    );
};

export default CommunityManagerDashboard;
