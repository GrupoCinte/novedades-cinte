import { User } from 'lucide-react';

/**
 * Identidad de sesión en la parte superior del sidebar (debajo de la marca).
 */
export default function AdminModuleSidebarUser({
    sidebarOpen,
    currentEmail,
    currentRoleLabel,
    emailClass,
    borderSubtle,
    accentClass = 'text-[#65BCF7]',
    accentBgClass = 'bg-[#2F7BB8]/20 border-[#2F7BB8]/30',
    isLight = false
}) {
    if (!sidebarOpen) {
        return (
            <div className={`flex shrink-0 justify-center border-b px-2 py-2 ${borderSubtle}`} title={`${currentEmail} · ${currentRoleLabel}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${accentBgClass}`}>
                    <User size={14} className={accentClass} />
                </div>
            </div>
        );
    }

    return (
        <div className={`shrink-0 border-b px-4 py-3 ${borderSubtle}`}>
            <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${accentBgClass}`}>
                    <User size={15} className={accentClass} />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                    <p className={`truncate text-[11px] font-body font-black leading-tight ${emailClass}`}>{currentEmail}</p>
                    <p className={`truncate text-[10px] font-body font-semibold uppercase leading-tight ${accentClass}`}>
                        {currentRoleLabel}
                    </p>
                </div>
            </div>
        </div>
    );
}
