import React from 'react';
import AFPDLogo from './AFPDLogo';

const AdminNavbar = ({
    isSidebarOpen,
    isSidebarMobileOpen,
    setIsSidebarMobileOpen,
    sections,
    activeSectionId,
    onSelectSection,
}) => {
    return (
        <>
            {/* Mobile Overlay */}
            <button
                type="button"
                aria-label="Fermer la sidebar"
                onClick={() => setIsSidebarMobileOpen(false)}
                className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden ${isSidebarMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            />

            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky lg:top-0 top-0 left-0 z-50 h-screen bg-white border-r border-fuchsia-100 transition-all duration-200 ${isSidebarOpen ? 'w-64' : 'w-20'
                    } ${isSidebarMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between px-4 py-4 border-b border-fuchsia-100">
                        <div className="flex items-center gap-3">
                            <AFPDLogo compact showTitle={isSidebarOpen} titleClassName="text-fuchsia-700" />
                            <span className={`text-sm font-medium text-fuchsia-700/80 ${isSidebarOpen ? 'block' : 'hidden'}`}>
                                Admin
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsSidebarMobileOpen(false)}
                            className="lg:hidden p-2 rounded-lg hover:bg-fuchsia-50 text-gray-600"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <nav className="flex-1 px-3 py-4 space-y-2">
                        {sections.map((item) => {
                            const isActive = activeSectionId === item.id;
                            const hasBadge = typeof item.badge === 'number' && item.badge > 0;
                            const badgeText = hasBadge ? (item.badge > 99 ? '99+' : String(item.badge)) : '';
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        onSelectSection(item.id);
                                        setIsSidebarMobileOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                            ? 'bg-fuchsia-50 text-fuchsia-700'
                                            : 'text-gray-600 hover:bg-fuchsia-50/70 hover:text-gray-900'
                                        }`}
                                >
                                    <span className="relative text-fuchsia-500">
                                        {item.icon}
                                        {!isSidebarOpen && hasBadge && (
                                            <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                                                {badgeText}
                                            </span>
                                        )}
                                    </span>
                                    <span className={`flex-1 text-left ${isSidebarOpen ? 'block' : 'hidden'}`}>{item.label}</span>
                                    {isSidebarOpen && hasBadge && (
                                        <span className="inline-flex min-w-[22px] h-[22px] px-1.5 items-center justify-center rounded-full bg-rose-500 text-white text-xs font-semibold">
                                            {badgeText}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="px-3 py-4 border-t border-fuchsia-100 space-y-3">
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-50/60 text-sm text-gray-700 ${isSidebarOpen ? 'justify-start' : 'justify-center'}`}>
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            </span>
                            <span className={`${isSidebarOpen ? 'block' : 'hidden'}`}>Connectée</span>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default AdminNavbar;
