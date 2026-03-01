import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNavbar from './AdminNavbar';
import AdminDashboard from './dashboard';
import AccessModal from './AccessModal';
import AFPDLogo from './AFPDLogo';
import { API_BASE_URL, apiDelete, apiFetch, apiGet, apiPut, clearAuthToken } from '../src/api';

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

const MembersView = () => {
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
        } catch (error) {
            setEditError("La mise à jour a échoué. Merci de réessayer.");
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
        } catch (error) {
            setDeleteError("La suppression a échoué. Merci de réessayer.");
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

const PendingMembersView = () => {
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
        } catch (error) {
            setActionError("L'action a échoué. Merci de réessayer.");
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
        } catch (error) {
            setActionError("L'action a échoué. Merci de réessayer.");
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="w-full px-6 py-8">
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

const PendingEventsView = ({ onPendingEventsCountChange }) => {
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
            const response = await fetchPendingEventsPayload();
            const events = toApiList(response)
                .filter((event) => event?.id !== undefined && event?.id !== null)
                .map(mapEventForModeration);
            setPendingEvents(events);
            if (typeof onPendingEventsCountChange === 'function') {
                onPendingEventsCountChange(events.length);
            }
        } catch (error) {
            setPendingEventsError("Impossible de charger les événements en attente.");
            if (typeof onPendingEventsCountChange === 'function') {
                onPendingEventsCountChange(0);
            }
        } finally {
            setIsLoadingPendingEvents(false);
        }
    }, [onPendingEventsCountChange]);

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
        } catch (error) {
            setActionError("L'action sur l'événement a échoué. Merci de réessayer.");
        } finally {
            setProcessingEventId(null);
        }
    };

    const filteredPendingEvents = useMemo(() => {
        const query = normalizeToken(searchQuery);
        if (!query) return pendingEvents;

        return pendingEvents.filter((event) => {
            const haystack = normalizeToken([
                event?.title,
                event?.description,
                event?.place,
                event?.responsibleName,
            ].filter(Boolean).join(' '));
            return haystack.includes(query);
        });
    }, [pendingEvents, searchQuery]);

    return (
        <div className="w-full px-6 py-8">
            <div className="bg-white rounded-2xl p-8 mb-6 shadow-sm border border-fuchsia-100">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            Validation des événements
                        </h1>
                        <p className="text-fuchsia-600/80">
                            Consultez les détails d'un événement avant de le valider ou le rejeter.
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
                        placeholder="Rechercher un événement en attente..."
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
                                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-fuchsia-100/60">
                            {isLoadingPendingEvents && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Chargement des événements...
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPendingEvents && pendingEventsError && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-red-600">
                                        {pendingEventsError}
                                    </td>
                                </tr>
                            )}
                            {!isLoadingPendingEvents && !pendingEventsError && filteredPendingEvents.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Aucun événement en attente.
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
                                        <button
                                            type="button"
                                            onClick={() => openDetails(event)}
                                            className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-all duration-200 hover:-translate-y-0.5"
                                        >
                                            Voir détails
                                        </button>
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
                                    Vérifiez les informations avant validation.
                                </p>
                            </div>
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                En attente
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
                                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => handleModerationAction(selectedEvent?.id, 'reject')}
                                        disabled={!selectedEvent?.id || processingEventId === selectedEvent?.id}
                                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                                    >
                                        {processingEventId === selectedEvent?.id ? 'Traitement...' : 'Rejeter'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleModerationAction(selectedEvent?.id, 'validate')}
                                        disabled={!selectedEvent?.id || processingEventId === selectedEvent?.id}
                                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                                    >
                                        {processingEventId === selectedEvent?.id ? 'Traitement...' : 'Valider'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
    const navigate = useNavigate();

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
            headerTitle: 'Demandes en attente',
            headerSubtitle: 'Validation des adhérentes',
            component: PendingMembersView,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z" />
                </svg>
            ),
        },
        {
            id: 'pending-events',
            label: 'Événements',
            headerTitle: 'Validation des événements',
            headerSubtitle: 'Validation / rejet des événements',
            component: PendingEventsView,
            badge: pendingEventsCount > 0 ? pendingEventsCount : null,
            icon: (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6h13M9 7V3m0 14v4m0-4H5m4-6h8M5 11h4m0 0V7m0 4v6" />
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
                    onLogout={handleLogout}
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
                                    <button className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm hover:-translate-y-0.5">
                                        Mon Profil
                                    </button>
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-fuchsia-200">
                                        <img
                                            src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=100&h=100&fit=crop"
                                            alt="User"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="w-full flex-1">
                        <ActiveComponent onPendingEventsCountChange={setPendingEventsCount} />
                    </main>

                    {/* Footer */}
                    <footer className="bg-white border-t border-fuchsia-100 mt-12">
                        <div className="w-full px-6 py-6 text-center text-sm text-gray-600">
                            © 2024 Association des Femmes à la Pointe du Digital (AFPD). Tous droits réservés.
                        </div>
                    </footer>
                </div>
            </div>

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
