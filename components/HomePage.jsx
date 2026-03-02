import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccessModal from '../components/AccessModal';
import { apiGet, apiPost, clearAuthToken, setAuthToken } from '../src/api';
import AFPDLogo from './AFPDLogo';

const HomePage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const normalizeRole = (role) => {
        if (!role) return '';
        return role
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    };

    const resolveRoleName = async (roleId, fallbackRoleName) => {
        if (fallbackRoleName) return fallbackRoleName;
        if (!roleId) return '';
        try {
            const roles = await apiGet('/api/roles');
            if (!Array.isArray(roles)) return '';
            const match = roles.find((role) => role?.id === roleId);
            return match?.nom_role || '';
        } catch {
            return '';
        }
    };

    const isCommunityManagerRole = (normalizedRole) => {
        if (!normalizedRole) return false;
        return (
            normalizedRole.includes('communitymanager') ||
            normalizedRole.includes('community manager') ||
            normalizedRole.includes('community-manager') ||
            normalizedRole.includes('community_manager') ||
            normalizedRole.includes('managercommunaute') ||
            normalizedRole.includes('manager communaute') ||
            (normalizedRole.includes('community') && normalizedRole.includes('manager'))
        );
    };

    const isPresidenteRole = (normalizedRole) => {
        if (!normalizedRole) return false;
        return (
            normalizedRole.includes('presidente') ||
            normalizedRole.includes('president') ||
            normalizedRole.includes('admin') ||
            normalizedRole.includes('administrateur') ||
            normalizedRole.includes('administration')
        );
    };

    const toUserPayload = (payload) => {
        if (!payload || typeof payload !== 'object') return null;
        if (payload?.user && typeof payload.user === 'object') return payload.user;
        if (payload?.data && typeof payload.data === 'object') {
            if (payload.data?.user && typeof payload.data.user === 'object') return payload.data.user;
            return payload.data;
        }
        return payload;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setIsSubmitting(true);

        try {
            // setAuthStorage(rememberMe);
            const data = await apiPost('/api/login', { email, password });
            const token = data?.token ?? data?.access_token ?? data?.data?.token ?? '';
            if (token) {
                setAuthToken(token);
            }
            let connectedUser = toUserPayload(data);
            try {
                const me = await apiGet('/api/me');
                connectedUser = toUserPayload(me) || connectedUser;
            } catch {
                // Si /me échoue, on garde la réponse de login comme fallback.
            }

            const roleId = connectedUser?.role_id ?? connectedUser?.role?.id ?? data?.user?.role_id;
            const roleName =
                connectedUser?.role?.nom_role ||
                connectedUser?.role?.name ||
                connectedUser?.nom_role ||
                connectedUser?.role_name ||
                connectedUser?.role ||
                data?.role ||
                '';
            const resolvedRoleName = await resolveRoleName(roleId, roleName);
            const normalizedRole = normalizeRole(resolvedRoleName);

            // setToken(data?.token);
            // setUser(data?.user);
            if (isPresidenteRole(normalizedRole)) {
                navigate('/admin');
            } else if (normalizedRole.includes('tresoriere') || normalizedRole.includes('tresorier')) {
                navigate('/tresorier');
            } else if (isCommunityManagerRole(normalizedRole)) {
                navigate('/community-manager');
            } else {
                navigate('/utilisatrice');
            }
        } catch (error) {
            clearAuthToken();
            const status = error?.status;
            if (status === 403) {
                setErrorMessage('Compte non validé par l’administration.');
            } else if (status === 401) {
                setErrorMessage('Email ou mot de passe incorrect.');
            } else {
                setErrorMessage(error?.message || 'Erreur de connexion.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const openAccessModal = () => {
        setIsAccessModalOpen(true);
    };

    const closeAccessModal = () => {
        setIsAccessModalOpen(false);
    };

    return (
        <div className="relative min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/40 to-fuchsia-50/50 flex items-center justify-center overflow-hidden">
            {/* Background Orbs */}
            <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-fuchsia-200/50 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-32 h-96 w-96 rounded-full bg-pink-200/60 blur-3xl" />
            {/* Navigation Header */}
            <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-white/40 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <AFPDLogo compact />
                    <div className="flex items-center gap-8">
                        <a href="#" className="text-gray-700 hover:text-fuchsia-700 text-sm font-medium hover:bg-fuchsia-100 px-4 py-2 rounded-lg transition-colors">Accueil</a>
                        <a href="#" className="text-gray-700 hover:text-fuchsia-700 text-sm font-medium hover:bg-fuchsia-100 px-4 py-2 rounded-lg transition-colors">À propos</a>
                        <a href="#" className="text-gray-700 hover:text-fuchsia-700 text-sm font-medium hover:bg-fuchsia-100 px-4 py-2 rounded-lg transition-colors">Contact</a>
                        <button
                            onClick={openAccessModal}
                            className="bg-fuchsia-700 hover:bg-fuchsia-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-fuchsia-500/20"
                        >
                            Demander un accès
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="w-full mt-16 mx-auto">
                <div className="backdrop-blur ring-1 ring-black/5 overflow-hidden">
                    <div className="grid md:grid-cols-2">
                        {/* Left Panel - Brand Section */}
                        <div className="bg-gradient-to-br from-fuchsia-700 via-fuchsia-600 to-violet-700 p-12 text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-8">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                    <span>ESPACE SÉCURISÉ</span>
                                </div>

                                <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                                    Innover, s'entraider, transformer.
                                </h1>

                                <p className="text-base text-fuchsia-100 mb-12 leading-relaxed">
                                    Une plateforme par et pour les femmes du digital, pour piloter les initiatives avec force et clarte.
                                </p>

                                <div className="rounded-2xl overflow-hidden ring-1 ring-white/10">
                                    <img
                                        src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=400&fit=crop"
                                        alt="Dashboard Preview"
                                        className="w-full h-auto object-cover"
                                    />
                                </div>
                            </div>

                            {/* Decorative Elements */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-400/30 rounded-full blur-3xl" />
                            <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-900/30 rounded-full blur-3xl" />
                        </div>

                        {/* Right Panel - Login Form */}
                        <div className="p-12">
                            <div className="max-w-md mx-auto">
                                <h2 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">
                                    Connexion au Système
                                </h2>
                                <p className="text-base text-gray-600 mb-8">
                                    Bienvenue sur l'espace de gestion AFPD.
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {errorMessage && (
                                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                            {errorMessage}
                                        </div>
                                    )}
                                    {/* Email Field */}
                                    <div>
                                        <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2.5">
                                            Adresse e-mail
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                                </svg>
                                            </div>
                                            <input
                                                id="email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="exemple@afpd.com"
                                                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-gray-900 placeholder-gray-400 bg-white/90"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Password Field */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2.5">
                                            <label htmlFor="password" className="block text-sm font-semibold text-gray-900">
                                                Mot de passe
                                            </label>
                                            <a href="#" className="text-sm font-medium text-fuchsia-700 hover:text-fuchsia-800">
                                                Mot de passe oublié ?
                                            </a>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-gray-900 bg-white/90"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
                                            >
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                    {showPassword ? (
                                                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
                                                    ) : (
                                                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                                    )}
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Remember Me */}
                                    <div className="flex items-center">
                                        <input
                                            id="remember"
                                            type="checkbox"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="w-4 h-4 text-fuchsia-700 border-gray-300 rounded focus:ring-fuchsia-500"
                                        />
                                        <label htmlFor="remember" className="ml-2 text-sm text-gray-600">
                                            Se souvenir de moi
                                        </label>
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={`w-full bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-fuchsia-500/20 hover:shadow-xl text-base ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                                            }`}
                                    >
                                        {isSubmitting ? 'Connexion...' : 'Se connecter'}
                                    </button>

                                    {/* Footer Link */}
                                    <div className="text-center text-base text-gray-600">
                                        Vous n'avez pas de compte ?{' '}
                                        <a href="#" className="font-semibold text-fuchsia-700 hover:text-fuchsia-800">
                                            Contactez l'administration
                                        </a>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="text-center text-base text-gray-600 mt-8 pb-8">
                    © 2024 Association des Femmes à la Pointe du Digital (AFPD). Tous droits réservés.
                </footer>
            </div>

            <AccessModal isOpen={isAccessModalOpen} onClose={closeAccessModal} />
        </div>
    );
};

export default HomePage;
