import React, { useEffect, useMemo, useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import { API_BASE_URL, apiGet } from '../src/api';

const toItem = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray(payload)) return null;
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return payload.data;
    }
    return payload;
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

const ProfileAvatarBadge = ({ size = 38, onClick }) => {
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        let mounted = true;
        const loadProfile = async () => {
            try {
                const response = await apiGet('/api/me');
                if (!mounted) return;
                setProfile(toItem(response));
            } catch {
                if (!mounted) return;
                setProfile(null);
            }
        };
        loadProfile();
        return () => {
            mounted = false;
        };
    }, []);

    const avatarUrl = useMemo(() => getAvatarUrl(profile), [profile]);
    const iconSize = Math.max(16, Math.floor(size * 0.62));

    const body = (
        <span
            className="inline-flex items-center justify-center rounded-full overflow-hidden border-2 border-fuchsia-200 bg-fuchsia-50"
            style={{ width: `${size}px`, height: `${size}px` }}
        >
            {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
                <UserCircle2 className="text-fuchsia-500" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
            )}
        </span>
    );

    if (!onClick) return body;

    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            aria-label="Ouvrir mon profil"
        >
            {body}
        </button>
    );
};

export default ProfileAvatarBadge;
