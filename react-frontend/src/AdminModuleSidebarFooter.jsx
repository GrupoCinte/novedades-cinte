import UserAccountMenu from './UserAccountMenu.jsx';
import ChatWidget from './ChatWidget.jsx';

/**
 * Pie del sidebar: cuenta (tema, alertas) y CINTEBot opcional en la misma fila.
 */
export default function AdminModuleSidebarFooter({
    auth,
    onLogout,
    sidebarOpen,
    borderSubtle,
    chatCtx = null,
    isLight = false
}) {
    const assistantSlot = chatCtx ? (
        <ChatWidget
            ctx={chatCtx}
            placement="inline"
            sidebarExpanded={sidebarOpen}
            isLight={isLight}
        />
    ) : null;

    return (
        <div
            className={`relative z-[60] mt-auto shrink-0 overflow-visible border-t pb-[max(0.75rem,env(safe-area-inset-bottom))] ${borderSubtle} ${
                sidebarOpen ? 'px-3 py-3' : 'px-2 py-2.5'
            }`}
        >
            <div
                className={`flex min-w-0 ${
                    sidebarOpen
                        ? 'flex-wrap items-center justify-end gap-2'
                        : 'flex-col items-center justify-center gap-2'
                }`}
            >
                <UserAccountMenu
                    auth={auth}
                    onLogout={onLogout}
                    surface="sidebar"
                    sidebarCompact={!sidebarOpen}
                    notificationCount={0}
                    assistantSlot={assistantSlot}
                />
            </div>
        </div>
    );
}
