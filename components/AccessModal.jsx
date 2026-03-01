import React, { useState } from 'react';
import { apiPost } from '../src/api';

const AccessModal = ({ isOpen, onClose }) => {
    const [accessForm, setAccessForm] = useState({
        nom: '',
        prenom: '',
        password: '',
        telephone: '',
        email: '',
    });
    const [isSubmittingAccess, setIsSubmittingAccess] = useState(false);
    const [accessSubmitError, setAccessSubmitError] = useState('');
    const [accessSubmitSuccess, setAccessSubmitSuccess] = useState('');

    const updateAccessField = (field, value) => {
        setAccessForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleAccessSubmit = async (e) => {
        e.preventDefault();
        setAccessSubmitError('');
        setAccessSubmitSuccess('');
        setIsSubmittingAccess(true);

        try {
            const payload = {
                ...accessForm,
                nom: accessForm.nom,
                prenom: accessForm.prenom,
                password: accessForm.password,
            };
            await apiPost('/api/register', payload);
            setAccessSubmitSuccess("Demande envoyée. Nous reviendrons vers vous rapidement.");
            setAccessForm({
                nom: '',
                prenom: '',
                password: '',
                telephone: '',
                email: '',
            });
        } catch (error) {
            console.error('Erreur complet:', error);
            console.error('Status:', error?.status);
            console.error('Body:', error?.body);
            const errorMsg = error?.body?.message || error?.message || "Une erreur s'est produite. Merci de réessayer.";
            setAccessSubmitError(errorMsg);
        } finally {
            setIsSubmittingAccess(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="Fermer la fenêtre"
                onClick={onClose}
                className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
                style={{ animation: 'backdropIn 0.2s ease-out' }}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="access-modal-title"
                className="relative z-10 w-full max-w-2xl bg-white rounded-3xl shadow-2xl shadow-slate-900/20 ring-1 ring-black/10 overflow-hidden"
                style={{ animation: 'modalIn 0.25s ease-out' }}
            >
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-fuchsia-50 via-white to-rose-50">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 id="access-modal-title" className="text-lg font-semibold text-slate-900">
                                Demande d'accès
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Décrivez votre besoin, nous vous recontactons rapidement.
                            </p>
                        
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-10 w-10 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-red-100 transition focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 color-slate-500"
                        >
                            <span className="sr-only">Fermer</span>
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                <path d="M6.225 4.811a1 1 0 011.414 0L12 9.172l4.361-4.361a1 1 0 111.414 1.414L13.414 10.586l4.361 4.361a1 1 0 01-1.414 1.414L12 12l-4.361 4.361a1 1 0 01-1.414-1.414l4.361-4.361-4.361-4.361a1 1 0 010-1.414z" />
                            </svg>
                        </button>
                    </div>
                </div>

                <form onSubmit={handleAccessSubmit} className="px-6 py-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-900 mb-2" htmlFor="access-full-name">
                                Nom
                            </label>
                            <input
                                id="access-full-name"
                                type="text"
                                value={accessForm.nom}
                                onChange={(e) => updateAccessField('nom', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                placeholder="nom"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-900 mb-2" htmlFor="access-organization">
                                Prénom
                            </label>
                            <input
                                id="access-organization"
                                type="text"
                                value={accessForm.prenom}
                                onChange={(e) => updateAccessField('prenom', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                placeholder="prénom"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-900 mb-2" htmlFor="access-role">
                                Password
                            </label>
                            <input
                                id="access-role"
                                type="text"
                                value={accessForm.password}
                                onChange={(e) => updateAccessField('password', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                placeholder="Ex: password"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-900 mb-2" htmlFor="access-phone">
                                Téléphone
                            </label>
                            <input
                                id="access-phone"
                                type="tel"
                                value={accessForm.telephone}
                                onChange={(e) => updateAccessField('telephone', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                placeholder="+237 6 78 34 56 78"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-slate-900 mb-2" htmlFor="access-email">
                                Email
                            </label>
                            <input
                                id="access-email"
                                type="email"
                                value={accessForm.email}
                                onChange={(e) => updateAccessField('email', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                                placeholder="nom@example.com"
                                required
                            />
                        </div>
                        {/* <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-slate-900 mb-2" htmlFor="access-message">
                                Message
                            </label>
                            <textarea
                                id="access-message"
                                value={accessForm.message}
                                onChange={(e) => updateAccessField('message', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900 min-h-[120px] resize-none"
                                placeholder="Dites-nous en quelques lignes ce que vous souhaitez faire."
                            />
                        </div> */}
                    </div>

                    {accessSubmitError && (
                        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                            {accessSubmitError}
                        </div>
                    )}
                    {accessSubmitSuccess && (
                        <div className="rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm font-medium border border-emerald-200">
                            {accessSubmitSuccess}
                        </div>
                    )}

                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all duration-200 font-medium bg-gray-200 text-base"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmittingAccess}
                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold shadow-lg shadow-fuchsia-500/20 hover:bg-fuchsia-700 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                        >
                            {isSubmittingAccess ? 'Envoi en cours...' : "Envoyer la demande"}
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes modalIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                @keyframes backdropIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default AccessModal;
