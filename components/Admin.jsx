import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNavbar from './AdminNavbar';
import AdminDashboard from './dashboard';
import AccessModal from './AccessModal';
import AFPDLogo from './AFPDLogo';
import ProfileModal from './ProfileModal';
import ProfileAvatarBadge from './ProfileAvatarBadge';
import { API_BASE_URL, apiDelete, apiDownload, apiFetch, apiGet, apiPost, apiPut, clearAuthToken } from '../src/api';

const toApiList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const toApiItem = (payload) => {
    if (!payload) return null;
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return payload.data;
    }
    if (typeof payload === 'object' && !Array.isArray(payload)) {
        return payload;
    }
    return null;
};

const normalizeToken = (value) => {
    if (value === undefined || value === null) return '';
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

const getEventStatusToken = (event) =>
    normalizeToken(
        event?.statut ??
        event?.status ??
        event?.etat ??
        event?.state ??
        event?.validation_status ??
        event?.moderation_status
    );

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

const getEventParticipantsCount = (event) => {
    const directCount = Number(
        event?.participants_count ??
        event?.inscriptions_count ??
        event?.participantsCount ??
        event?.inscrits_count
    );
    if (!Number.isNaN(directCount) && directCount >= 0) return directCount;

    const participants =
        (Array.isArray(event?.participants) && event.participants) ||
        (Array.isArray(event?.inscriptions) && event.inscriptions) ||
        (Array.isArray(event?.adherentes) && event.adherentes) ||
        [];
    return participants.length;
};

const getEventRegistrationFlag = (event) => {
    const value =
        event?.is_inscrit ??
        event?.is_subscribed ??
        event?.inscrite ??
        event?.registered;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const token = normalizeToken(value);
        return ['1', 'true', 'yes', 'oui', 'inscrit', 'inscrite'].includes(token);
    }
    return false;
};

const mapEventForModeration = (event) => {
    const id = event?.id;
    const title = event?.titre ?? event?.title ?? 'Sans titre';
    const description = event?.description ?? event?.details ?? '';
    const startAt = event?.date_debut ?? event?.dateDebut ?? event?.start_date ?? event?.startDate;
    const endAt = event?.date_fin ?? event?.dateFin ?? event?.end_date ?? event?.endDate;
    const place = event?.lieu ?? event?.location ?? '-';
    const responsibleName =
        `${event?.responsable?.nom ?? ''} ${event?.responsable?.prenom ?? ''}`.trim() ||
        event?.responsable?.name ||
        event?.responsable_nom ||
        '-';

    return {
        id,
        title,
        description,
        startAt,
        endAt,
        place,
        responsibleName,
        participantsCount: getEventParticipantsCount(event),
        isRegistered: getEventRegistrationFlag(event),
        statusToken: getEventStatusToken(event),
        createdAt: event?.created_at ?? event?.createdAt ?? null,
        imageUrl: getEventImageUrl(event),
        raw: event,
    };
};

const fetchPendingEventsPayload = async () => {
    try {
        return await apiGet('/api/admin/pending-events');
    } catch (error) {
        if (error?.status === 404) {
            return apiGet('/api/admin/evenements/pending');
        }
        throw error;
    }
};

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

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
};

const MembersView = ({ notify }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('Toutes');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortOption, setSortOption] = useState('date_desc');
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [members, setMembers] = useState([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [membersError, setMembersError] = useState('');
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSavingMember, setIsSavingMember] = useState(false);
    const [isDeletingMember, setIsDeletingMember] = useState(false);
    const [editError, setEditError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [roles, setRoles] = useState([]);
    const [rolesError, setRolesError] = useState('');
    const [editForm, setEditForm] = useState({
        nom: '',
        prenom: '',
        email: '',
        telephone: '',
        statut: 'actif',
        role_id: '',
    });
    const getInitials = (lastName, firstName) => {
        const first = (lastName || '').trim().charAt(0);
        const second = (firstName || '').trim().charAt(0);
        return `${first}${second}`.toUpperCase() || '--';
    };

    const fetchMembers = useCallback(async () => {
        setIsLoadingMembers(true);
        setMembersError('');
        try {
            const data = await apiGet('/api/users');
            const nonPendingUsers = Array.isArray(data)
                ? data.filter((user) => (user?.statut ?? '').toLowerCase() !== 'pending')
                : [];
            setMembers(nonPendingUsers);
        } catch (error) {
            setMembersError("Impossible de charger les membres.");
        } finally {
            setIsLoadingMembers(false);
        }
    }, []);

    const fetchRoles = useCallback(async () => {
        setRolesError('');
        try {
            const data = await apiGet('/api/roles');
            setRoles(Array.isArray(data) ? data : []);
        } catch (error) {
            setRolesError("Impossible de charger les rôles.");
        }
    }, []);

    useEffect(() => {
        fetchMembers();
        fetchRoles();
    }, [fetchMembers, fetchRoles]);

    const openEditModal = (member) => {
        setSelectedMember(member);
        setEditError('');
        setEditForm({
            nom: member?.nom ?? '',
            prenom: member?.prenom ?? '',
            email: member?.email ?? '',
            telephone: member?.telephone ?? '',
            statut: member?.statut ?? 'actif',
            role_id: member?.role_id ?? member?.role?.id ?? '',
        });
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setSelectedMember(null);
    };

    const openDeleteModal = (member) => {
        setSelectedMember(member);
        setDeleteError('');
        setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
        setIsDeleteModalOpen(false);
        setSelectedMember(null);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!selectedMember?.id || isSavingMember) return;
        setIsSavingMember(true);
        setEditError('');

        try {
            const roleId = editForm.role_id ? Number(editForm.role_id) : null;
            const payload = {
                nom: editForm.nom.trim(),
                prenom: editForm.prenom.trim(),
                email: editForm.email.trim(),
                telephone: editForm.telephone.trim() || null,
                statut: editForm.statut,
                role_id: roleId,
            };
            await apiPut(`/api/users/${selectedMember.id}`, payload);
            await fetchMembers();
            closeEditModal();
            notify?.('success', 'Adhérente mise à jour.');
        } catch (error) {
            setEditError("La mise à jour a échoué. Merci de réessayer.");
            notify?.('error', "La mise à jour de l'adhérente a échoué.");
        } finally {
            setIsSavingMember(false);
        }
    };

    const handleDeleteMember = async () => {
        if (!selectedMember?.id || isDeletingMember) return;
        setIsDeletingMember(true);
        setDeleteError('');

        try {
            await apiDelete(`/api/users/${selectedMember.id}`);
            await fetchMembers();
            closeDeleteModal();
            notify?.('success', 'Adhérente supprimée.');
        } catch (error) {
            setDeleteError("La suppression a échoué. Merci de réessayer.");
            notify?.('error', "La suppression de l'adhérente a échoué.");
        } finally {
            setIsDeletingMember(false);
        }
    };

    const updateEditField = (field, value) => {
        setEditForm((prev) => ({ ...prev, [field]: value }));
    };

    const itemsPerPage = 4;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeFilter, sortOption, members.length]);

    const filteredMembers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return members.filter((member) => {
            const fullName = `${member?.nom ?? ''} ${member?.prenom ?? ''}`.trim();
            const matchesSearch = !query ||
                fullName.toLowerCase().includes(query) ||
                (member?.email ?? '').toLowerCase().includes(query);
            const matchesFilter = activeFilter === 'Toutes' ||
                (activeFilter === 'Actives' && member?.statut === 'actif') ||
                (activeFilter === 'Inactives' && member?.statut === 'inactif');
            return matchesSearch && matchesFilter;
        });
    }, [members, searchQuery, activeFilter]);

    const sortedMembers = useMemo(() => {
        const list = [...filteredMembers];
        const getMemberDateMs = (member) => {
            const value = member?.created_at ?? member?.createdAt ?? member?.date_inscription ?? member?.date;
            if (!value) return null;
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
        };
        if (sortOption === 'date_asc' || sortOption === 'date_desc') {
            list.sort((a, b) => {
                const aDate = getMemberDateMs(a);
                const bDate = getMemberDateMs(b);
                if (aDate === null && bDate === null) return 0;
                if (aDate === null) return 1;
                if (bDate === null) return -1;
                return sortOption === 'date_asc' ? aDate - bDate : bDate - aDate;
            });
        }
        if (sortOption === 'name_asc' || sortOption === 'name_desc') {
            list.sort((a, b) => {
                const nameA = `${a?.nom ?? ''} ${a?.prenom ?? ''}`.trim();
                const nameB = `${b?.nom ?? ''} ${b?.prenom ?? ''}`.trim();
                const result = nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
                return sortOption === 'name_asc' ? result : -result;
            });
        }
        return list;
    }, [filteredMembers, sortOption]);

    const totalMembers = sortedMembers.length;
    const totalPages = Math.max(1, Math.ceil(totalMembers / itemsPerPage));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const startItem = totalMembers === 0 ? 0 : (safeCurrentPage - 1) * itemsPerPage + 1;
    const endItem = totalMembers === 0 ? 0 : Math.min(startItem + itemsPerPage - 1, totalMembers);

    const paginatedMembers = useMemo(() => {
        const startIndex = (safeCurrentPage - 1) * itemsPerPage;
        return sortedMembers.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedMembers, safeCurrentPage]);

    return (
        <div className="w-full px-6 py-8">
            {/* Page Title Section */}
            <div className="bg-white rounded-2xl p-8 mb-6 shadow-sm border border-fuchsia-100">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            Gestion des Adhérentes
                        </h1>
                        <p className="text-fuchsia-600/80">
                            Gérez les membres de l'Association des Femmes à la Pointe du Digital.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsAccessModalOpen(true)}
                        className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Ajouter une adhérente
                    </button>
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-fuchsia-100">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Rechercher par nom, email..."
                            className="w-full pl-12 pr-4 py-3.5 bg-fuchsia-50/70 border border-fuchsia-100 rounded-xl focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-gray-900 placeholder-fuchsia-400"
                        />
                    </div>

                    {/* Filter Buttons */}
                    <div className="flex items-center gap-2 bg-fuchsia-50/80 border border-fuchsia-100 rounded-xl p-1">
                        {['Toutes', 'Actives', 'Inactives'].map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeFilter === filter
                                        ? 'bg-slate-300 text-slate-900 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>

                    {/* Advanced Filters Toggle */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsSortMenuOpen((prev) => !prev)}
                            className="flex items-center gap-2 px-4 py-2.5 border border-fuchsia-100 rounded-xl hover:bg-fuchsia-50 transition-all text-gray-700 font-medium"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                            Filtres
                            <svg className={`w-4 h-4 transition-transform ${isSortMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {isSortMenuOpen && (
                            <div className="absolute right-0 mt-2 w-64 bg-white border border-fuchsia-100 rounded-xl shadow-lg z-20">
                                {[
                                    { value: 'date_desc', label: 'Date décroissante' },
                                    { value: 'date_asc', label: 'Date croissante' },
                                    { value: 'name_asc', label: 'Nom A → Z' },
                                    { value: 'name_desc', label: 'Nom Z → A' }
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setSortOption(option.value);
                                            setIsSortMenuOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${sortOption === option.value
                                                ? 'bg-fuchsia-50 text-fuchsia-700 font-semibold'
                                                : 'text-gray-700 hover:bg-fuchsia-50'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Members Table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-fuchsia-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white border-b border-fuchsia-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Nom Complet
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Téléphone
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Email
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Rôle
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Statut
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-fuchsia-100/60">
                            {isLoadingMembers && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Chargement des membres...
                                    </td>
                                </tr>
                            )}
                            {!isLoadingMembers && membersError && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-red-600">
                                        {membersError}
                                    </td>
                                </tr>
                            )}
                            {!isLoadingMembers && !membersError && sortedMembers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Aucun membre actif trouvé.
                                    </td>
                                </tr>
                            )}
                            {!isLoadingMembers && !membersError && paginatedMembers.map((member, index) => {
                                const fullName = `${member?.nom ?? ''} ${member?.prenom ?? ''}`.trim();
                                const roleName = member?.role?.nom_role ?? '-';
                                return (
                                    <tr
                                        key={member.id}
                                        className="hover:bg-fuchsia-50/40 transition-colors"
                                        style={{
                                            animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`,
                                        }}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-700 font-semibold flex items-center justify-center text-sm tracking-wide shadow-sm ring-1 ring-rose-200">
                                                    {getInitials(member?.nom, member?.prenom)}
                                                </div>
                                                <div className="font-semibold text-gray-900">{fullName || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {member?.telephone ?? '-'}
                                        </td>
                                        <td className="px-6 py-4 text-fuchsia-600">
                                            {member?.email ?? '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-700">
                                            {roleName}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${member?.statut === 'actif'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {member?.statut ?? '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditModal(member)}
                                                    className="p-2 text-fuchsia-500 hover:text-fuchsia-700 hover:bg-fuchsia-50 rounded-lg transition-all"
                                                >
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openDeleteModal(member)}
                                                    className="p-2 text-fuchsia-500 hover:text-fuchsia-700 hover:bg-fuchsia-50 rounded-lg transition-all"
                                                >
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-6 py-4 bg-white border-t border-fuchsia-100 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                        Affichage de <span className="font-semibold">{totalMembers === 0 ? 0 : startItem}</span> à <span className="font-semibold">{totalMembers === 0 ? 0 : endItem}</span> sur <span className="font-semibold">{totalMembers}</span> adhérentes
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-fuchsia-50 rounded-lg transition-all border border-fuchsia-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={safeCurrentPage === 1}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-9 h-9 rounded-lg font-medium transition-all border border-fuchsia-100 ${safeCurrentPage === page
                                    ? 'bg-fuchsia-600 text-white shadow-lg'
                                    : 'text-gray-700 hover:bg-fuchsia-50'
                                    }`}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-fuchsia-50 rounded-lg transition-all border border-fuchsia-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={safeCurrentPage === totalPages}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {isEditModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Fermer la fenêtre"
                        onClick={closeEditModal}
                        className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
                    />
                    <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-900/20 ring-1 ring-black/10 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="text-lg font-semibold text-slate-900">Modifier un utilisateur</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Mettez à jour les informations du membre sélectionné.
                            </p>
                        </div>
                        <form onSubmit={handleEditSubmit} className="px-6 py-5 space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="edit-nom" className="block text-sm font-semibold text-slate-900 mb-2">
                                        Nom
                                    </label>
                                    <input
                                        id="edit-nom"
                                        type="text"
                                        value={editForm.nom}
                                        onChange={(e) => updateEditField('nom', e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-prenom" className="block text-sm font-semibold text-slate-900 mb-2">
                                        Prénom
                                    </label>
                                    <input
                                        id="edit-prenom"
                                        type="text"
                                        value={editForm.prenom}
                                        onChange={(e) => updateEditField('prenom', e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                        required
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="edit-email" className="block text-sm font-semibold text-slate-900 mb-2">
                                        Email
                                    </label>
                                    <input
                                        id="edit-email"
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => updateEditField('email', e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-telephone" className="block text-sm font-semibold text-slate-900 mb-2">
                                        Téléphone
                                    </label>
                                    <input
                                        id="edit-telephone"
                                        type="tel"
                                        value={editForm.telephone ?? ''}
                                        onChange={(e) => updateEditField('telephone', e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-statut" className="block text-sm font-semibold text-slate-900 mb-2">
                                        Statut
                                    </label>
                                    <select
                                        id="edit-statut"
                                        value={editForm.statut}
                                        onChange={(e) => updateEditField('statut', e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                    >
                                        <option value="actif">Actif</option>
                                        <option value="inactif">Inactif</option>
                                        <option value="pending">Pending</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="edit-role" className="block text-sm font-semibold text-slate-900 mb-2">
                                        Rôle
                                    </label>
                                    <select
                                        id="edit-role"
                                        value={editForm.role_id}
                                        onChange={(e) => updateEditField('role_id', e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                    >
                                        <option value="">Sélectionner un rôle</option>
                                        {roles.map((role) => (
                                            <option key={role.id} value={role.id}>
                                                {role.nom_role}
                                            </option>
                                        ))}
                                    </select>
                                    {rolesError && (
                                        <p className="text-xs text-red-600 mt-2">{rolesError}</p>
                                    )}
                                </div>
                            </div>

                            {editError && (
                                <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                    {editError}
                                </div>
                            )}

                            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeEditModal}
                                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all duration-200 font-medium bg-gray-200 text-base"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingMember}
                                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold shadow-lg shadow-fuchsia-500/20 hover:bg-fuchsia-700 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                                >
                                    {isSavingMember ? 'Mise à jour...' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Fermer la fenêtre"
                        onClick={closeDeleteModal}
                        className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
                    />
                    <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/20 ring-1 ring-black/10 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h3 className="text-lg font-semibold text-slate-900">Supprimer un utilisateur</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Cette action est irréversible.
                            </p>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-slate-700">
                                Confirmez la suppression de{' '}
                                <span className="font-semibold">
                                    {`${selectedMember?.nom ?? ''} ${selectedMember?.prenom ?? ''}`.trim() || 'cet utilisateur'}
                                </span>
                                .
                            </p>
                            {deleteError && (
                                <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                    {deleteError}
                                </div>
                            )}
                            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeDeleteModal}
                                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all duration-200 font-medium bg-gray-200 text-base"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteMember}
                                    disabled={isDeletingMember}
                                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                                >
                                    {isDeletingMember ? 'Suppression...' : 'Supprimer'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Animations CSS */}
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>

            <AccessModal
                isOpen={isAccessModalOpen}
                onClose={() => setIsAccessModalOpen(false)}
            />
        </div>
    );
};

const PendingMembersView = ({ notify, embedded = false }) => {
    const [pendingMembers, setPendingMembers] = useState([]);
    const [isLoadingPending, setIsLoadingPending] = useState(true);
    const [pendingError, setPendingError] = useState('');
    const [actionError, setActionError] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const getInitials = (lastName, firstName) => {
        const first = (lastName || '').trim().charAt(0);
        const second = (firstName || '').trim().charAt(0);
        return `${first}${second}`.toUpperCase() || '--';
    };

    const fetchPendingMembers = useCallback(async () => {
        setIsLoadingPending(true);
        setPendingError('');
        try {
            const data = await apiGet('/api/admin/pending-users');
            const pendingUsers = Array.isArray(data)
                ? data.filter((user) => user?.statut === 'pending')
                : [];
            setPendingMembers(pendingUsers);
        } catch (error) {
            setPendingError("Impossible de charger les demandes en attente.");
        } finally {
            setIsLoadingPending(false);
        }
    }, []);

    useEffect(() => {
        fetchPendingMembers();
    }, [fetchPendingMembers]);

    const handleAcceptPending = async (id) => {
        if (!id || processingId) return;
        setProcessingId(id);
        setActionError('');
        try {
            await apiPut(`/api/admin/validate-user/${id}`);
            await fetchPendingMembers();
            notify?.('success', 'Demande validée.');
        } catch (error) {
            setActionError("L'action a échoué. Merci de réessayer.");
            notify?.('error', 'Validation de la demande échouée.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleRejectPending = async (id) => {
        if (!id || processingId) return;
        setProcessingId(id);
        setActionError('');
        try {
            await apiDelete(`/api/admin/reject-user/${id}`);
            await fetchPendingMembers();
            notify?.('success', 'Demande rejetée.');
        } catch (error) {
            setActionError("L'action a échoué. Merci de réessayer.");
            notify?.('error', 'Rejet de la demande échoué.');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className={embedded ? 'w-full' : 'w-full px-6 py-8'}>
            {!embedded && (
                <div className="bg-white rounded-2xl p-8 mb-6 shadow-sm border border-fuchsia-100">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">
                                Demandes en attente
                            </h1>
                            <p className="text-fuchsia-600/80">
                                Validez ou rejetez les nouvelles demandes d'accès.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-fuchsia-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white border-b border-fuchsia-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Nom Complet
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Téléphone
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Email
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Rôle
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Statut
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-fuchsia-100/60">
                            {isLoadingPending && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Chargement des demandes...
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPending && pendingError && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-red-600">
                                        {pendingError}
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPending && !pendingError && pendingMembers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Aucune demande en attente.
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPending && !pendingError && pendingMembers.map((member) => {
                                const fullName = `${member?.nom ?? ''} ${member?.prenom ?? ''}`.trim();
                                const roleName = member?.role?.nom_role ?? '-';
                                return (
                                    <tr key={member.id} className="hover:bg-fuchsia-50/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-full bg-teal-100 text-teal-700 font-semibold flex items-center justify-center text-sm tracking-wide shadow-sm ring-1 ring-teal-200">
                                                    {getInitials(member?.nom, member?.prenom)}
                                                </div>
                                                <div className="font-semibold text-gray-900">{fullName || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {member?.telephone ?? '-'}
                                        </td>
                                        <td className="px-6 py-4 text-fuchsia-600">
                                            {member?.email ?? '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-700">
                                            {roleName}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                {member?.statut ?? 'pending'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleAcceptPending(member.id)}
                                                    disabled={processingId === member.id}
                                                    className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    Accepter
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRejectPending(member.id)}
                                                    disabled={processingId === member.id}
                                                    className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    Rejeter
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {actionError && (
                    <div className="px-6 py-4 bg-red-50 text-red-700 text-sm font-medium border-t border-red-100">
                        {actionError}
                    </div>
                )}
            </div>
        </div>
    );
};

const PendingEventsView = ({ onPendingEventsCountChange, notify, mode = 'pending', embedded = false }) => {
    const [pendingEvents, setPendingEvents] = useState([]);
    const [isLoadingPendingEvents, setIsLoadingPendingEvents] = useState(true);
    const [pendingEventsError, setPendingEventsError] = useState('');
    const [actionError, setActionError] = useState('');
    const [processingEventId, setProcessingEventId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState('');
    const [isImageLoadError, setIsImageLoadError] = useState(false);

    const fetchPendingEvents = useCallback(async () => {
        setIsLoadingPendingEvents(true);
        setPendingEventsError('');
        try {
            const response = mode === 'all'
                ? await apiGet('/api/evenements')
                : await fetchPendingEventsPayload();
            const events = toApiList(response)
                .filter((event) => event?.id !== undefined && event?.id !== null)
                .map(mapEventForModeration);
            setPendingEvents(events);
            if (mode === 'pending' && typeof onPendingEventsCountChange === 'function') {
                onPendingEventsCountChange(events.length);
            }
        } catch (error) {
            setPendingEventsError(
                mode === 'all'
                    ? "Impossible de charger la liste des événements."
                    : "Impossible de charger les événements en attente."
            );
            if (mode === 'pending' && typeof onPendingEventsCountChange === 'function') {
                onPendingEventsCountChange(0);
            }
        } finally {
            setIsLoadingPendingEvents(false);
        }
    }, [mode, onPendingEventsCountChange]);

    useEffect(() => {
        fetchPendingEvents();
    }, [fetchPendingEvents]);

    const openDetails = async (eventRow) => {
        if (!eventRow?.id) return;
        setSelectedEvent(eventRow);
        setDetailsError('');
        setIsImageLoadError(false);
        setIsDetailsOpen(true);
        setIsLoadingDetails(true);

        try {
            const response = await apiGet(`/api/evenements/${eventRow.id}`);
            const fullEvent = toApiItem(response);
            if (fullEvent) {
                setSelectedEvent(mapEventForModeration(fullEvent));
            } else {
                setSelectedEvent(eventRow);
            }
        } catch (error) {
            // Le endpoint détail peut être restreint: on conserve les données déjà disponibles.
            setSelectedEvent(eventRow);
            setDetailsError('');
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const closeDetails = () => {
        setIsDetailsOpen(false);
        setSelectedEvent(null);
        setDetailsError('');
        setIsImageLoadError(false);
    };

    const handleModerationAction = async (eventId, actionType) => {
        if (!eventId || processingEventId) return;
        setProcessingEventId(eventId);
        setActionError('');
        try {
            if (actionType === 'validate') {
                await apiPut(`/api/admin/validate-event/${eventId}`);
            } else {
                await apiPut(`/api/admin/reject-event/${eventId}`);
            }
            await fetchPendingEvents();
            closeDetails();
            notify?.('success', actionType === 'validate' ? 'Événement validé.' : 'Événement rejeté.');
        } catch (error) {
            setActionError("L'action sur l'événement a échoué. Merci de réessayer.");
            notify?.('error', "L'action sur l'événement a échoué.");
        } finally {
            setProcessingEventId(null);
        }
    };

    const filteredPendingEvents = useMemo(() => {
        const query = normalizeToken(searchQuery);
        const source = mode === 'all'
            ? pendingEvents
            : pendingEvents.filter((event) => {
                const statusToken = normalizeToken(event?.statusToken);
                return statusToken.includes('pending') || statusToken.includes('attente');
            });
        if (!query) return source;

        return source.filter((event) => {
            const haystack = normalizeToken([
                event?.title,
                event?.description,
                event?.place,
                event?.responsibleName,
            ].filter(Boolean).join(' '));
            return haystack.includes(query);
        });
    }, [mode, pendingEvents, searchQuery]);

    return (
        <div className={embedded ? 'w-full' : 'w-full px-6 py-8'}>
            {!embedded && (
                <div className="bg-white rounded-2xl p-8 mb-6 shadow-sm border border-fuchsia-100">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">
                                {mode === 'all' ? 'Tous les événements' : 'Validation des événements'}
                            </h1>
                            <p className="text-fuchsia-600/80">
                                {mode === 'all'
                                    ? 'Visualisez l’ensemble des événements enregistrés.'
                                    : "Consultez les détails d'un événement avant de le valider ou le rejeter."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={fetchPendingEvents}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-all duration-200 text-sm font-medium"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Actualiser
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-fuchsia-100">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={mode === 'all' ? 'Rechercher un événement...' : 'Rechercher un événement en attente...'}
                            className="w-full pl-12 pr-4 py-3.5 bg-fuchsia-50/70 border border-fuchsia-100 rounded-xl focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-gray-900 placeholder-fuchsia-400"
                        />
                    </div>
                </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-fuchsia-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white border-b border-fuchsia-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Événement</th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Date début</th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Lieu</th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Responsable</th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Inscriptions</th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Mon inscription</th>
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                                    {mode === 'all' ? 'Actions' : 'Action'}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-fuchsia-100/60">
                            {isLoadingPendingEvents && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                                        Chargement des événements...
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPendingEvents && pendingEventsError && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-red-600">
                                        {pendingEventsError}
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPendingEvents && !pendingEventsError && filteredPendingEvents.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                                        {mode === 'all' ? 'Aucun événement trouvé.' : 'Aucun événement en attente.'}
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPendingEvents && !pendingEventsError && filteredPendingEvents.map((event) => (
                                <tr key={event.id} className="hover:bg-fuchsia-50/40 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-gray-900">{event.title}</div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            Statut détecté: {event.statusToken || 'en attente'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {formatDateTime(event.startAt)}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {event.place || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {event.responsibleName || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-700 font-semibold">
                                        {event.participantsCount}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                            event.isRegistered
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {event.isRegistered ? 'Inscrite' : 'Non inscrite'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {mode === 'all' ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleModerationAction(event.id, 'validate')}
                                                    disabled={processingEventId === event.id}
                                                    className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold disabled:opacity-60"
                                                >
                                                    {processingEventId === event.id ? '...' : 'Activer'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleModerationAction(event.id, 'reject')}
                                                    disabled={processingEventId === event.id}
                                                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-60"
                                                >
                                                    Refuser
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openDetails(event)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-all duration-200 hover:-translate-y-0.5"
                                                >
                                                    Détails
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => openDetails(event)}
                                                className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-all duration-200 hover:-translate-y-0.5"
                                            >
                                                Voir détails
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {actionError && (
                    <div className="px-6 py-4 bg-red-50 text-red-700 text-sm font-medium border-t border-red-100">
                        {actionError}
                    </div>
                )}
            </div>

            {isDetailsOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Fermer la fenêtre"
                        onClick={closeDetails}
                        className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
                    />
                    <div className="relative z-10 w-full max-w-3xl bg-white rounded-2xl shadow-2xl shadow-slate-900/20 ring-1 ring-black/10 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">
                                    Détails de l'événement
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {mode === 'all'
                                        ? "Détails de l'événement sélectionné."
                                        : 'Vérifiez les informations avant validation.'}
                                </p>
                            </div>
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                {mode === 'all'
                                    ? (selectedEvent?.statusToken || 'événement')
                                    : 'En attente'}
                            </span>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {isLoadingDetails && (
                                <div className="text-sm text-slate-500">Chargement des détails...</div>
                            )}
                            {detailsError && (
                                <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                    {detailsError}
                                </div>
                            )}
                            {selectedEvent && (
                                <div className="space-y-4">
                                    {selectedEvent.imageUrl && !isImageLoadError && (
                                        <div className="rounded-2xl overflow-hidden border border-fuchsia-100">
                                            <img
                                                src={selectedEvent.imageUrl}
                                                alt={selectedEvent.title}
                                                className="w-full h-40 md:h-44 object-cover"
                                                onError={() => setIsImageLoadError(true)}
                                            />
                                        </div>
                                    )}
                                    {(!selectedEvent.imageUrl || isImageLoadError) && (
                                        <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/60 px-4 py-3 text-sm text-slate-600">
                                            Image indisponible pour cet événement.
                                        </div>
                                    )}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Titre</p>
                                            <p className="text-base font-semibold text-slate-900">{selectedEvent.title}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Responsable</p>
                                            <p className="text-base text-slate-800">{selectedEvent.responsibleName || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Date début</p>
                                            <p className="text-base text-slate-800">{formatDateTime(selectedEvent.startAt)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Date fin</p>
                                            <p className="text-base text-slate-800">{formatDateTime(selectedEvent.endAt)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Lieu</p>
                                            <p className="text-base text-slate-800">{selectedEvent.place || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Inscriptions</p>
                                            <p className="text-base text-slate-800">{selectedEvent.participantsCount}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wide">Mon inscription</p>
                                            <p className="text-base text-slate-800">
                                                {selectedEvent.isRegistered ? 'Inscrite' : 'Non inscrite'}
                                            </p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Description</p>
                                        <p className="text-sm text-slate-700 whitespace-pre-line">
                                            {selectedEvent.description || 'Aucune description fournie.'}
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeDetails}
                                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all duration-200 font-medium bg-gray-200 text-base"
                                >
                                    Fermer
                                </button>
                                {(mode === 'pending' || mode === 'all') && (
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => handleModerationAction(selectedEvent?.id, 'reject')}
                                            disabled={!selectedEvent?.id || processingEventId === selectedEvent?.id}
                                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                                        >
                                            {processingEventId === selectedEvent?.id ? 'Traitement...' : 'Refuser'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleModerationAction(selectedEvent?.id, 'validate')}
                                            disabled={!selectedEvent?.id || processingEventId === selectedEvent?.id}
                                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                                        >
                                            {processingEventId === selectedEvent?.id ? 'Traitement...' : 'Activer'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const PendingCenterView = ({ onPendingEventsCountChange, notify }) => {
    const [pendingScope, setPendingScope] = useState('members');

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-fuchsia-100">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">En attente</h1>
                        <p className="text-fuchsia-600/80">
                            Basculez entre les adhérentes et les événements en attente de traitement.
                        </p>
                    </div>
                    <div className="inline-flex rounded-xl border border-fuchsia-100 bg-fuchsia-50/70 p-1">
                        {[
                            { id: 'members', label: 'Adhérentes en attente' },
                            { id: 'events', label: 'Événements en attente' },
                        ].map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setPendingScope(item.id)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                                    pendingScope === item.id ? 'bg-white text-fuchsia-700 shadow-sm' : 'text-slate-600'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {pendingScope === 'members' ? (
                <PendingMembersView notify={notify} embedded />
            ) : (
                <PendingEventsView
                    notify={notify}
                    mode="pending"
                    embedded
                    onPendingEventsCountChange={onPendingEventsCountChange}
                />
            )}
        </div>
    );
};

const EventsView = ({ notify }) => (
    <PendingEventsView notify={notify} mode="all" />
);

const NotificationsView = ({ notify }) => {
    const [notifications, setNotifications] = useState([]);
    const [filter, setFilter] = useState('unread');
    const [isLoading, setIsLoading] = useState(true);
    const [loadingError, setLoadingError] = useState('');
    const [actionError, setActionError] = useState('');
    const [message, setMessage] = useState('');
    const [targetUserId, setTargetUserId] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isUpdatingId, setIsUpdatingId] = useState(null);
    const [isMarkingAll, setIsMarkingAll] = useState(false);

    const fetchNotifications = useCallback(async () => {
        setIsLoading(true);
        setLoadingError('');

        try {
            const params = new URLSearchParams();
            if (filter === 'all') params.set('all', '1');
            if (filter === 'read') params.set('lu', '1');
            if (filter === 'unread') params.set('lu', '0');
            const query = params.toString();
            const endpoint = `/api/notifications${query ? `?${query}` : ''}`;
            const response = await apiGet(endpoint);
            setNotifications(toApiList(response));
        } catch (error) {
            setNotifications([]);
            setLoadingError('Impossible de charger les notifications.');
        } finally {
            setIsLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (isSending) return;
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            setActionError('Le message est requis.');
            return;
        }

        setIsSending(true);
        setActionError('');
        try {
            const payload = { message: trimmedMessage };
            const normalizedUserId = targetUserId.trim();
            if (normalizedUserId) {
                const numericUserId = Number(normalizedUserId);
                if (!Number.isNaN(numericUserId)) {
                    payload.user_id = numericUserId;
                }
            }
            await apiPost('/api/notifications', payload);
            setMessage('');
            setTargetUserId('');
            await fetchNotifications();
            notify?.('success', 'Notification envoyée.');
        } catch (error) {
            setActionError(error?.body?.message || "L'envoi de la notification a échoué.");
            notify?.('error', "L'envoi de la notification a échoué.");
        } finally {
            setIsSending(false);
        }
    };

    const handleMarkRead = async (id) => {
        if (!id || isUpdatingId) return;
        setIsUpdatingId(id);
        setActionError('');
        try {
            await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
            setNotifications((prev) => prev.map((item) => (
                item?.id === id
                    ? { ...item, lu: true, read: true, is_read: true, read_at: item?.read_at || new Date().toISOString() }
                    : item
            )));
            notify?.('success', 'Notification marquée comme lue.');
        } catch (error) {
            setActionError(error?.body?.message || 'Impossible de marquer la notification comme lue.');
            notify?.('error', 'Impossible de marquer la notification comme lue.');
        } finally {
            setIsUpdatingId(null);
        }
    };

    const handleMarkAllRead = async () => {
        if (isMarkingAll) return;
        setIsMarkingAll(true);
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
            notify?.('success', 'Toutes les notifications ont été marquées comme lues.');
        } catch (error) {
            setActionError(error?.body?.message || "Impossible de marquer toutes les notifications comme lues.");
            notify?.('error', "Impossible de marquer toutes les notifications comme lues.");
        } finally {
            setIsMarkingAll(false);
        }
    };

    const unreadCount = useMemo(() => (
        notifications.filter((notification) => !isNotificationRead(notification)).length
    ), [notifications]);

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-fuchsia-100">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Notifications internes</h1>
                        <p className="text-fuchsia-600/80">Diffusez des messages et suivez leur lecture.</p>
                    </div>
                    <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">
                        {unreadCount} non lue(s)
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1.9fr] gap-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouvelle notification</h2>
                    <form onSubmit={handleSend} className="space-y-4">
                        <div>
                            <label htmlFor="notif-message" className="block text-sm font-semibold text-slate-900 mb-2">
                                Message
                            </label>
                            <textarea
                                id="notif-message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none min-h-[120px]"
                                placeholder="Annonce interne..."
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="notif-user-id" className="block text-sm font-semibold text-slate-900 mb-2">
                                ID destinataire (optionnel)
                            </label>
                            <input
                                id="notif-user-id"
                                type="number"
                                min="1"
                                value={targetUserId}
                                onChange={(e) => setTargetUserId(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                placeholder="Ex: 12"
                            />
                        </div>
                        {actionError && (
                            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                {actionError}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={isSending}
                            className="w-full px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold hover:bg-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSending ? 'Envoi...' : 'Envoyer'}
                        </button>
                    </form>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="inline-flex rounded-xl border border-fuchsia-100 bg-fuchsia-50/70 p-1">
                            {[
                                { id: 'unread', label: 'Non lues' },
                                { id: 'read', label: 'Lues' },
                                { id: 'all', label: 'Toutes' },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setFilter(item.id)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                                        filter === item.id ? 'bg-white text-fuchsia-700 shadow-sm' : 'text-slate-600'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            disabled={isMarkingAll}
                            className="px-3 py-2 rounded-xl border border-fuchsia-200 text-fuchsia-700 text-sm font-medium hover:bg-fuchsia-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isMarkingAll ? 'Traitement...' : 'Tout marquer comme lu'}
                        </button>
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {isLoading && (
                            <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Chargement des notifications...
                            </div>
                        )}
                        {!isLoading && loadingError && (
                            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                {loadingError}
                            </div>
                        )}
                        {!isLoading && !loadingError && notifications.length === 0 && (
                            <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Aucune notification pour ce filtre.
                            </div>
                        )}
                        {!isLoading && !loadingError && notifications.map((notification) => {
                            const isRead = isNotificationRead(notification);
                            const notificationId = notification?.id;
                            return (
                                <article
                                    key={notificationId ?? `${notification?.message ?? 'notif'}-${notification?.created_at ?? ''}`}
                                    className={`rounded-xl border px-4 py-3 ${
                                        isRead ? 'border-slate-200 bg-white' : 'border-fuchsia-200 bg-fuchsia-50/50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-900">
                                                {notification?.message ?? notification?.contenu ?? notification?.title ?? 'Notification'}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Destinataire: {notification?.user_id ?? notification?.user?.id ?? 'tous'}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {formatDateTime(notification?.created_at ?? notification?.date ?? notification?.updated_at)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                isRead ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {isRead ? 'Lue' : 'Non lue'}
                                            </span>
                                            {!isRead && notificationId && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleMarkRead(notificationId)}
                                                    disabled={isUpdatingId === notificationId}
                                                    className="px-2.5 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-xs font-semibold hover:bg-fuchsia-50 disabled:opacity-60"
                                                >
                                                    {isUpdatingId === notificationId ? '...' : 'Marquer lue'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const AnnoncesView = ({ notify }) => {
    const [annonces, setAnnonces] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [loadingError, setLoadingError] = useState('');
    const [actionError, setActionError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [processingDeleteId, setProcessingDeleteId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        titre: '',
        contenu: '',
        statut: 'publie',
    });

    const fetchAnnonces = useCallback(async () => {
        setIsLoading(true);
        setLoadingError('');
        try {
            const endpoint = statusFilter === 'all'
                ? '/api/annonces'
                : `/api/annonces?statut=${encodeURIComponent(statusFilter)}`;
            const response = await apiGet(endpoint);
            setAnnonces(toApiList(response));
        } catch (error) {
            setAnnonces([]);
            setLoadingError('Impossible de charger les annonces.');
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchAnnonces();
    }, [fetchAnnonces]);

    const resetForm = () => {
        setForm({ titre: '', contenu: '', statut: 'publie' });
        setEditingId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        const titre = form.titre.trim();
        const contenu = form.contenu.trim();
        if (!titre || !contenu) {
            setActionError("Le titre et le contenu sont obligatoires.");
            return;
        }

        setIsSaving(true);
        setActionError('');
        try {
            const payload = { titre, contenu, statut: form.statut };
            if (editingId) {
                await apiFetch(`/api/annonces/${editingId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
                notify?.('success', 'Annonce mise à jour.');
            } else {
                await apiPost('/api/annonces', payload);
                notify?.('success', 'Annonce publiée.');
            }
            resetForm();
            await fetchAnnonces();
        } catch (error) {
            setActionError(error?.body?.message || "L'opération sur l'annonce a échoué.");
            notify?.('error', "L'opération sur l'annonce a échoué.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (annonceId) => {
        if (!annonceId || processingDeleteId) return;
        const confirmed = window.confirm('Supprimer cette annonce ?');
        if (!confirmed) return;

        setProcessingDeleteId(annonceId);
        setActionError('');
        try {
            await apiDelete(`/api/annonces/${annonceId}`);
            if (editingId === annonceId) resetForm();
            await fetchAnnonces();
            notify?.('success', 'Annonce supprimée.');
        } catch (error) {
            setActionError(error?.body?.message || "La suppression de l'annonce a échoué.");
            notify?.('error', "La suppression de l'annonce a échoué.");
        } finally {
            setProcessingDeleteId(null);
        }
    };

    const handleEdit = (annonce) => {
        setEditingId(annonce?.id ?? null);
        setForm({
            titre: annonce?.titre ?? '',
            contenu: annonce?.contenu ?? '',
            statut: annonce?.statut ?? 'publie',
        });
    };

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-fuchsia-100">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Annonces</h1>
                <p className="text-fuchsia-600/80">Publiez et maintenez les annonces internes.</p>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1.9fr] gap-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">
                        {editingId ? "Modifier l'annonce" : 'Nouvelle annonce'}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="annonce-titre" className="block text-sm font-semibold text-slate-900 mb-2">
                                Titre
                            </label>
                            <input
                                id="annonce-titre"
                                type="text"
                                value={form.titre}
                                onChange={(e) => setForm((prev) => ({ ...prev, titre: e.target.value }))}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="annonce-contenu" className="block text-sm font-semibold text-slate-900 mb-2">
                                Contenu
                            </label>
                            <textarea
                                id="annonce-contenu"
                                value={form.contenu}
                                onChange={(e) => setForm((prev) => ({ ...prev, contenu: e.target.value }))}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none min-h-[140px]"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="annonce-statut" className="block text-sm font-semibold text-slate-900 mb-2">
                                Statut
                            </label>
                            <select
                                id="annonce-statut"
                                value={form.statut}
                                onChange={(e) => setForm((prev) => ({ ...prev, statut: e.target.value }))}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                            >
                                <option value="publie">Publié</option>
                                <option value="brouillon">Brouillon</option>
                                <option value="archive">Archivé</option>
                            </select>
                        </div>
                        {actionError && (
                            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                {actionError}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold hover:bg-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'Sauvegarde...' : (editingId ? 'Mettre à jour' : 'Publier')}
                            </button>
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                                >
                                    Annuler
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">Historique des annonces</h2>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-700"
                        >
                            <option value="all">Tous statuts</option>
                            <option value="publie">Publié</option>
                            <option value="brouillon">Brouillon</option>
                            <option value="archive">Archivé</option>
                        </select>
                    </div>

                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {isLoading && (
                            <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Chargement des annonces...
                            </div>
                        )}
                        {!isLoading && loadingError && (
                            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                {loadingError}
                            </div>
                        )}
                        {!isLoading && !loadingError && annonces.length === 0 && (
                            <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Aucune annonce trouvée.
                            </div>
                        )}

                        {!isLoading && !loadingError && annonces.map((annonce) => (
                            <article key={annonce?.id ?? `${annonce?.titre ?? 'annonce'}-${annonce?.created_at ?? ''}`} className="rounded-xl border border-fuchsia-100 px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">
                                            {annonce?.titre ?? 'Sans titre'}
                                        </p>
                                        <p className="text-xs text-slate-600 whitespace-pre-line">
                                            {annonce?.contenu ?? '-'}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {formatDateTime(annonce?.created_at ?? annonce?.updated_at)}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-fuchsia-100 text-fuchsia-700">
                                            {annonce?.statut ?? 'n/a'}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {annonce?.id && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(annonce)}
                                                        className="px-2.5 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-xs font-semibold hover:bg-fuchsia-50"
                                                    >
                                                        Modifier
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(annonce.id)}
                                                        disabled={processingDeleteId === annonce.id}
                                                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
                                                    >
                                                        {processingDeleteId === annonce.id ? '...' : 'Supprimer'}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const RapportsExportsView = ({ notify }) => {
    const [reports, setReports] = useState([]);
    const [isLoadingReports, setIsLoadingReports] = useState(true);
    const [reportsError, setReportsError] = useState('');
    const [generationError, setGenerationError] = useState('');
    const [downloadError, setDownloadError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [exportError, setExportError] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [downloadingReportId, setDownloadingReportId] = useState(null);
    const [deletingReportId, setDeletingReportId] = useState(null);
    const [exportingKey, setExportingKey] = useState('');
    const [generateForm, setGenerateForm] = useState(() => {
        const now = new Date();
        return {
            month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            format: 'pdf',
        };
    });

    const fetchReports = useCallback(async () => {
        setIsLoadingReports(true);
        setReportsError('');
        try {
            const response = await apiGet('/api/rapports');
            setReports(toApiList(response));
        } catch (error) {
            setReports([]);
            setReportsError('Impossible de charger les rapports.');
        } finally {
            setIsLoadingReports(false);
        }
    }, []);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const getReportId = (report) => (
        report?.id ??
        report?.rapport_id ??
        report?.report_id ??
        null
    );

    const parseFilenameFromDisposition = (contentDisposition, fallbackName) => {
        if (!contentDisposition) return fallbackName;
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
        const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
        if (basicMatch?.[1]) return basicMatch[1];
        return fallbackName;
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (isGenerating) return;
        setIsGenerating(true);
        setGenerationError('');
        try {
            await apiPost('/api/reports/monthly/generate', {
                month: generateForm.month,
                format: generateForm.format,
            });
            await fetchReports();
            notify?.('success', 'Rapport mensuel généré.');
        } catch (error) {
            setGenerationError(error?.body?.message || 'La génération du rapport a échoué.');
            notify?.('error', 'La génération du rapport a échoué.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadReport = async (reportId) => {
        if (!reportId || downloadingReportId) return;
        setDownloadingReportId(reportId);
        setDownloadError('');
        try {
            const response = await apiFetch(`/api/reports/${reportId}/download`, { method: 'GET' });
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const body = await response.json();
                const downloadUrl = body?.url ?? body?.download_url ?? body?.data?.url ?? '';
                if (!downloadUrl) {
                    throw new Error('URL de téléchargement absente.');
                }
                window.open(downloadUrl, '_blank', 'noopener,noreferrer');
            } else {
                const disposition = response.headers.get('content-disposition') || '';
                const fallbackExt = contentType.includes('pdf') ? 'pdf' : 'csv';
                const fallbackName = `rapport-${reportId}.${fallbackExt}`;
                const filename = parseFilenameFromDisposition(disposition, fallbackName);
                const blob = await response.blob();
                downloadBlob(blob, filename);
            }
            notify?.('success', 'Téléchargement du rapport lancé.');
        } catch (error) {
            setDownloadError(error?.message || 'Le téléchargement du rapport a échoué.');
            notify?.('error', 'Le téléchargement du rapport a échoué.');
        } finally {
            setDownloadingReportId(null);
        }
    };

    const handleDeleteReport = async (reportId) => {
        if (!reportId || deletingReportId) return;
        const confirmed = window.confirm('Supprimer ce rapport ? Cette action est irréversible.');
        if (!confirmed) return;
        setDeletingReportId(reportId);
        setDeleteError('');
        try {
            await apiDelete(`/api/rapports/${reportId}`);
            await fetchReports();
            notify?.('success', 'Rapport supprimé.');
        } catch (error) {
            setDeleteError(error?.body?.message || 'La suppression du rapport a échoué.');
            notify?.('error', 'La suppression du rapport a échoué.');
        } finally {
            setDeletingReportId(null);
        }
    };

    const handleExportCsv = async (endpoint, filename) => {
        if (exportingKey) return;
        setExportingKey(endpoint);
        setExportError('');
        try {
            const blob = await apiDownload(endpoint);
            downloadBlob(blob, filename);
            notify?.('success', 'Export téléchargé.');
        } catch (error) {
            setExportError(error?.body?.message || "L'export CSV a échoué.");
            notify?.('error', "L'export CSV a échoué.");
        } finally {
            setExportingKey('');
        }
    };

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-fuchsia-100">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Rapports et exports</h1>
                <p className="text-fuchsia-600/80">Générez les rapports mensuels et exportez les données clés.</p>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1.9fr] gap-6">
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                        <h2 className="text-lg font-semibold text-slate-900 mb-4">Générer un rapport mensuel</h2>
                        <form onSubmit={handleGenerate} className="space-y-4">
                            <div>
                                <label htmlFor="report-month" className="block text-sm font-semibold text-slate-900 mb-2">
                                    Mois
                                </label>
                                <input
                                    id="report-month"
                                    type="month"
                                    value={generateForm.month}
                                    onChange={(e) => setGenerateForm((prev) => ({ ...prev, month: e.target.value }))}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor="report-format" className="block text-sm font-semibold text-slate-900 mb-2">
                                    Format
                                </label>
                                <select
                                    id="report-format"
                                    value={generateForm.format}
                                    onChange={(e) => setGenerateForm((prev) => ({ ...prev, format: e.target.value }))}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                >
                                    <option value="pdf">PDF</option>
                                    <option value="csv">CSV</option>
                                </select>
                            </div>
                            {generationError && (
                                <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                    {generationError}
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={isGenerating}
                                className="w-full px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold hover:bg-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isGenerating ? 'Génération...' : 'Générer'}
                            </button>
                        </form>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                        <h2 className="text-lg font-semibold text-slate-900 mb-4">Exports CSV rapides</h2>
                        <div className="space-y-2">
                            {[
                                { endpoint: '/api/exports/users.csv', label: 'Export adhérentes', filename: 'users.csv' },
                                { endpoint: '/api/exports/cotisations.csv', label: 'Export cotisations', filename: 'cotisations.csv' },
                                { endpoint: '/api/exports/evenements.csv', label: 'Export événements', filename: 'evenements.csv' },
                            ].map((item) => (
                                <button
                                    key={item.endpoint}
                                    type="button"
                                    onClick={() => handleExportCsv(item.endpoint, item.filename)}
                                    disabled={exportingKey === item.endpoint}
                                    className="w-full px-4 py-2.5 rounded-xl border border-fuchsia-200 text-fuchsia-700 font-semibold hover:bg-fuchsia-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {exportingKey === item.endpoint ? 'Export...' : item.label}
                                </button>
                            ))}
                        </div>
                        {exportError && (
                            <div className="mt-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                {exportError}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-fuchsia-100">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Rapports disponibles</h2>
                    <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                        {isLoadingReports && (
                            <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Chargement des rapports...
                            </div>
                        )}
                        {!isLoadingReports && reportsError && (
                            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                {reportsError}
                            </div>
                        )}
                        {!isLoadingReports && !reportsError && reports.length === 0 && (
                            <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                                Aucun rapport généré pour le moment.
                            </div>
                        )}
                        {!isLoadingReports && !reportsError && reports.map((report, index) => {
                            const reportId = getReportId(report);
                            return (
                                <article key={reportId ?? `report-${index}`} className="rounded-xl border border-fuchsia-100 px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-900 truncate">
                                                {report?.titre ?? report?.nom ?? `Rapport #${reportId ?? index + 1}`}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Période: {report?.periode ?? report?.month ?? '-'}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Type: {report?.type_rapport ?? report?.type ?? '-'}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {formatDateTime(report?.created_at ?? report?.updated_at)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadReport(reportId)}
                                                disabled={!reportId || downloadingReportId === reportId}
                                                className="px-3 py-2 rounded-xl border border-fuchsia-200 text-fuchsia-700 text-sm font-semibold hover:bg-fuchsia-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {downloadingReportId === reportId ? '...' : 'Télécharger'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteReport(reportId)}
                                                disabled={!reportId || deletingReportId === reportId}
                                                className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-sm font-semibold hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {deletingReportId === reportId ? '...' : 'Supprimer'}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    {downloadError && (
                        <div className="mt-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                            {downloadError}
                        </div>
                    )}
                    {deleteError && (
                        <div className="mt-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                            {deleteError}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Admin = ({ initialSectionId = 'dashboard' }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState(initialSectionId);
    const [isBooting, setIsBooting] = useState(true);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [pendingEventsCount, setPendingEventsCount] = useState(0);
    const [toasts, setToasts] = useState([]);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isUnifiedProfileOpen, setIsUnifiedProfileOpen] = useState(false);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileData, setProfileData] = useState(null);
    const [profileForm, setProfileForm] = useState({
        nom: '',
        prenom: '',
        email: '',
        telephone: '',
    });
    const [passwordForm, setPasswordForm] = useState({
        current_password: '',
        password: '',
        password_confirmation: '',
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [revokingTokenId, setRevokingTokenId] = useState(null);
    const navigate = useNavigate();

    const pushToast = useCallback((type, message) => {
        if (!message) return;
        const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        setToasts((prev) => [...prev, { id, type, message }].slice(-5));
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 4200);
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const hydrateProfile = useCallback((payload) => {
        const data = toApiItem(payload) || {};
        setProfileData(data);
        setProfileForm({
            nom: data?.nom ?? '',
            prenom: data?.prenom ?? '',
            email: data?.email ?? '',
            telephone: data?.telephone ?? '',
        });
        return data;
    }, []);

    const loadProfile = useCallback(async () => {
        setIsLoadingProfile(true);
        setProfileError('');
        try {
            const response = await apiGet('/api/me');
            hydrateProfile(response);
        } catch (error) {
            setProfileError("Impossible de charger le profil.");
            pushToast('error', "Impossible de charger le profil.");
        } finally {
            setIsLoadingProfile(false);
        }
    }, [hydrateProfile, pushToast]);

    const openProfileModal = () => {
        setIsProfileOpen(true);
        loadProfile();
    };

    const closeProfileModal = () => {
        setIsProfileOpen(false);
        setProfileError('');
        setPasswordForm({
            current_password: '',
            password: '',
            password_confirmation: '',
        });
    };

    const profileTokens = useMemo(() => {
        const candidates = [
            profileData?.tokens,
            profileData?.access_tokens,
            profileData?.personal_access_tokens,
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
            if (Array.isArray(candidate?.data)) return candidate.data;
        }
        return [];
    }, [profileData]);

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

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (isSavingProfile) return;
        setIsSavingProfile(true);
        setProfileError('');
        try {
            await apiFetch('/api/me', {
                method: 'PATCH',
                body: JSON.stringify({
                    nom: profileForm.nom.trim(),
                    prenom: profileForm.prenom.trim() || null,
                    email: profileForm.email.trim(),
                    telephone: profileForm.telephone.trim() || null,
                }),
            });
            await loadProfile();
            pushToast('success', 'Profil mis à jour.');
        } catch (error) {
            const message = error?.body?.message || "La mise à jour du profil a échoué.";
            setProfileError(message);
            pushToast('error', message);
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSavePassword = async (e) => {
        e.preventDefault();
        if (isSavingPassword) return;
        if (!passwordForm.current_password || !passwordForm.password || !passwordForm.password_confirmation) {
            const message = 'Tous les champs mot de passe sont obligatoires.';
            setProfileError(message);
            pushToast('error', message);
            return;
        }
        if (passwordForm.password !== passwordForm.password_confirmation) {
            const message = 'La confirmation du mot de passe ne correspond pas.';
            setProfileError(message);
            pushToast('error', message);
            return;
        }

        setIsSavingPassword(true);
        setProfileError('');
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
            pushToast('success', 'Mot de passe mis à jour.');
        } catch (error) {
            const message = error?.body?.message || "La mise à jour du mot de passe a échoué.";
            setProfileError(message);
            pushToast('error', message);
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleRevokeToken = async (tokenId) => {
        if (!tokenId || revokingTokenId) return;
        setRevokingTokenId(tokenId);
        setProfileError('');
        try {
            await apiFetch(`/api/me/tokens/${tokenId}`, { method: 'DELETE' });
            setProfileData((prev) => {
                if (!prev || typeof prev !== 'object') return prev;
                const dropFromArray = (value) => {
                    if (!Array.isArray(value)) return value;
                    return value.filter((token) => `${getTokenId(token)}` !== `${tokenId}`);
                };
                return {
                    ...prev,
                    tokens: dropFromArray(prev?.tokens),
                    access_tokens: dropFromArray(prev?.access_tokens),
                    personal_access_tokens: dropFromArray(prev?.personal_access_tokens),
                };
            });
            pushToast('success', 'Token révoqué.');
        } catch (error) {
            const message = error?.body?.message || 'La révocation du token a échoué.';
            setProfileError(message);
            pushToast('error', message);
        } finally {
            setRevokingTokenId(null);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => setIsBooting(false), 1200);
        return () => clearTimeout(timer);
    }, []);

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

    const refreshPendingEventsCount = useCallback(async () => {
        try {
            const response = await fetchPendingEventsPayload();
            const count = toApiList(response).filter((event) => event?.id !== undefined && event?.id !== null).length;
            setPendingEventsCount(count);
        } catch (error) {
            setPendingEventsCount(0);
        }
    }, []);

    useEffect(() => {
        refreshPendingEventsCount();
        const interval = setInterval(refreshPendingEventsCount, 30000);
        return () => clearInterval(interval);
    }, [refreshPendingEventsCount]);

    const sections = [
        {
            id: 'dashboard',
            label: 'Tableau de bord',
            headerTitle: 'Tableau de bord',
            headerSubtitle: 'Vue administratrice',
            component: AdminDashboard,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 13h6V4H4v9zm10 7h6V11h-6v9zM4 20h6v-5H4v5zm10-9h6V4h-6v7z" />
                </svg>
            ),
        },
        {
            id: 'members',
            label: 'Adhérentes',
            headerTitle: 'Gestion des Adhérentes',
            headerSubtitle: 'Vue administratrice',
            component: MembersView,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20a4 4 0 00-4-4H7a4 4 0 00-4 4m10-10a4 4 0 11-8 0 4 4 0 018 0m10 10v-1a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
            ),
        },
        {
            id: 'pending',
            label: 'En attente',
            headerTitle: 'En attente',
            headerSubtitle: 'Adhérentes et événements en attente',
            component: PendingCenterView,
            badge: pendingEventsCount > 0 ? pendingEventsCount : null,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z" />
                </svg>
            ),
        },
        {
            id: 'events',
            label: 'Événements',
            headerTitle: 'Tous les événements',
            headerSubtitle: 'Liste complète des événements',
            component: EventsView,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6h13M9 7V3m0 14v4m0-4H5m4-6h8M5 11h4m0 0V7m0 4v6" />
                </svg>
            ),
        },
        {
            id: 'notifications',
            label: 'Notifications',
            headerTitle: 'Notifications internes',
            headerSubtitle: 'Communication ciblée',
            component: NotificationsView,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
                </svg>
            ),
        },
        {
            id: 'annonces',
            label: 'Annonces',
            headerTitle: 'Gestion des annonces',
            headerSubtitle: 'Publication interne',
            component: AnnoncesView,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19a1 1 0 001.993.117L13 19V5.882a1 1 0 00-1.993-.117L11 5.882zM5 10l3 2H5a2 2 0 01-2-2V9a2 2 0 012-2h3L5 9v1zm14 0V9l-3-2h3a2 2 0 012 2v1a2 2 0 01-2 2h-3l3-2z" />
                </svg>
            ),
        },
        {
            id: 'reports',
            label: 'Rapports',
            headerTitle: 'Rapports et exports',
            headerSubtitle: 'Suivi mensuel et extractions',
            component: RapportsExportsView,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6m4 6V7m4 10v-3m-9 7h10a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
            ),
        },
    ];

    const activeSection = sections.find((section) => section.id === activeSectionId) || sections[0];
    const ActiveComponent = activeSection.component;

    return (
        <div className="min-h-screen bg-[#FDF5FA]">
            <div className="flex">
                <AdminNavbar
                    isSidebarOpen={isSidebarOpen}
                    isSidebarMobileOpen={isSidebarMobileOpen}
                    setIsSidebarMobileOpen={setIsSidebarMobileOpen}
                    sections={sections}
                    activeSectionId={activeSection.id}
                    onSelectSection={setActiveSectionId}
                />

                {/* Main Column */}
                <div className="flex-1 w-full flex flex-col">
                    {/* Header Navigation */}
                    <header className="bg-white border-b border-fuchsia-100 sticky top-0 z-30">
                        <div className="w-full px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsSidebarOpen(true);
                                            setIsSidebarMobileOpen(true);
                                        }}
                                        className="lg:hidden p-2 rounded-lg hover:bg-fuchsia-50 text-gray-600"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                        className="hidden lg:inline-flex p-2 rounded-lg hover:bg-fuchsia-50 text-gray-600"
                                    >
                                        <svg className={`w-5 h-5 transition-transform ${isSidebarOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">{activeSection.headerTitle}</h2>
                                        <p className="text-sm text-fuchsia-500">{activeSection.headerSubtitle}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsUnifiedProfileOpen(true)}
                                        className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm hover:-translate-y-0.5"
                                    >
                                        Mon Profil
                                    </button>
                                    <ProfileAvatarBadge onClick={() => setIsUnifiedProfileOpen(true)} />
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="w-full flex-1">
                        <ActiveComponent onPendingEventsCountChange={setPendingEventsCount} notify={pushToast} />
                    </main>

                    {/* Footer */}
                    <footer className="bg-white border-t border-fuchsia-100 mt-12">
                        <div className="w-full px-6 py-6 text-center text-sm text-gray-600">
                            © 2026 Association des Femmes à la Pointe du Digital (AFPD). Tous droits réservés.
                        </div>
                    </footer>
                </div>
            </div>

            {isProfileOpen && (
                <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Fermer la fenêtre profil"
                        onClick={closeProfileModal}
                        className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
                    />
                    <div className="relative z-10 w-full max-w-4xl bg-white rounded-2xl shadow-2xl shadow-slate-900/20 ring-1 ring-black/10 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Mon Profil</h3>
                                <p className="text-sm text-slate-500">
                                    Informations personnelles, mot de passe et sessions actives.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeProfileModal}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-red-100"
                            >
                                <span className="sr-only">Fermer</span>
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                    <path d="M6.225 4.811a1 1 0 011.414 0L12 9.172l4.361-4.361a1 1 0 111.414 1.414L13.414 10.586l4.361 4.361a1 1 0 01-1.414 1.414L12 12l-4.361 4.361a1 1 0 01-1.414-1.414l4.361-4.361-4.361-4.361a1 1 0 010-1.414z" />
                                </svg>
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-6 max-h-[78vh] overflow-y-auto">
                            {isLoadingProfile && (
                                <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500">
                                    Chargement du profil...
                                </div>
                            )}
                            {profileError && (
                                <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                                    {profileError}
                                </div>
                            )}

                            <div className="grid lg:grid-cols-2 gap-6">
                                <form onSubmit={handleSaveProfile} className="rounded-2xl border border-fuchsia-100 p-4 space-y-4">
                                    <h4 className="text-base font-semibold text-slate-900">Informations du compte</h4>
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="profile-nom" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                                Nom
                                            </label>
                                            <input
                                                id="profile-nom"
                                                type="text"
                                                value={profileForm.nom}
                                                onChange={(e) => setProfileForm((prev) => ({ ...prev, nom: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="profile-prenom" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                                Prénom
                                            </label>
                                            <input
                                                id="profile-prenom"
                                                type="text"
                                                value={profileForm.prenom}
                                                onChange={(e) => setProfileForm((prev) => ({ ...prev, prenom: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label htmlFor="profile-email" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                                Email
                                            </label>
                                            <input
                                                id="profile-email"
                                                type="email"
                                                value={profileForm.email}
                                                onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                                required
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label htmlFor="profile-telephone" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                                Téléphone
                                            </label>
                                            <input
                                                id="profile-telephone"
                                                type="text"
                                                value={profileForm.telephone}
                                                onChange={(e) => setProfileForm((prev) => ({ ...prev, telephone: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isSavingProfile || isLoadingProfile}
                                        className="w-full px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold hover:bg-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {isSavingProfile ? 'Mise à jour...' : 'Mettre à jour le profil'}
                                    </button>
                                </form>

                                <form onSubmit={handleSavePassword} className="rounded-2xl border border-fuchsia-100 p-4 space-y-4">
                                    <h4 className="text-base font-semibold text-slate-900">Sécurité du compte</h4>
                                    <div>
                                        <label htmlFor="current-password" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                            Mot de passe actuel
                                        </label>
                                        <input
                                            id="current-password"
                                            type="password"
                                            value={passwordForm.current_password}
                                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="new-password" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                            Nouveau mot de passe
                                        </label>
                                        <input
                                            id="new-password"
                                            type="password"
                                            value={passwordForm.password}
                                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-900 mb-1.5">
                                            Confirmation
                                        </label>
                                        <input
                                            id="confirm-password"
                                            type="password"
                                            value={passwordForm.password_confirmation}
                                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, password_confirmation: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isSavingPassword || isLoadingProfile}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {isSavingPassword ? 'Mise à jour...' : 'Changer le mot de passe'}
                                    </button>
                                </form>
                            </div>

                            <section className="rounded-2xl border border-fuchsia-100 p-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <h4 className="text-base font-semibold text-slate-900">Tokens actifs</h4>
                                    <button
                                        type="button"
                                        onClick={loadProfile}
                                        disabled={isLoadingProfile}
                                        className="px-3 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 text-xs font-semibold hover:bg-fuchsia-50 disabled:opacity-60"
                                    >
                                        Recharger
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {profileTokens.length === 0 && (
                                        <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500">
                                            Aucun token actif remonté par l'API.
                                        </div>
                                    )}
                                    {profileTokens.map((token, index) => {
                                        const tokenId = getTokenId(token);
                                        return (
                                            <div key={tokenId ?? `token-${index}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-900 truncate">{getTokenLabel(token)}</p>
                                                    <p className="text-xs text-slate-500">
                                                        Dernière utilisation: {formatDateTime(token?.last_used_at ?? token?.updated_at ?? token?.created_at)}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRevokeToken(tokenId)}
                                                    disabled={!tokenId || revokingTokenId === tokenId}
                                                    className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
                                                >
                                                    {revokingTokenId === tokenId ? '...' : 'Révoquer'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            <ProfileModal
                isOpen={isUnifiedProfileOpen}
                onClose={() => setIsUnifiedProfileOpen(false)}
                onLogout={handleLogout}
            />

            {toasts.length > 0 && (
                <div className="fixed right-4 top-4 z-[95] space-y-2 w-[340px] max-w-[calc(100vw-2rem)]">
                    {toasts.map((toast) => {
                        const tone = toast.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border-red-200 text-red-700';
                        return (
                            <div key={toast.id} className={`rounded-xl border px-4 py-3 shadow-sm ${tone}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-medium">{toast.message}</p>
                                    <button
                                        type="button"
                                        onClick={() => dismissToast(toast.id)}
                                        className="text-xs font-semibold opacity-80 hover:opacity-100"
                                    >
                                        Fermer
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isBooting && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-white/40 backdrop-blur-md px-6">
                    <div className="w-full max-w-md bg-white/90 rounded-3xl shadow-2xl shadow-fuchsia-500/10 border border-fuchsia-100 px-8 py-10 text-center">
                        <div className="mx-auto flex justify-center">
                            <AFPDLogo compact showTitle={false} />
                        </div>
                        <div className="mt-6 h-2 w-full rounded-full bg-fuchsia-100 overflow-hidden">
                            <div className="h-full w-2/3 bg-gradient-to-r from-fuchsia-500 to-fuchsia-700 rounded-full animate-pulse" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
