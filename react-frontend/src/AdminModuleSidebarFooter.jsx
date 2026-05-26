import UserAccountMenu from './UserAccountMenu.jsx';
import ChatWidget from './ChatWidget.jsx';

/**
 * Pie del sidebar: cuenta (tema, alertas) y CINTEBot opcional en filas separadas.
 */
export default function AdminModuleSidebarFooter({
    auth,
    onLogout,
    sidebarOpen,
    borderSubtle,
    chatCtx = null,
    isLight = false
}) {
    return (
        <div
            className={`relative z-[60] mt-auto shrink-0 overflow-visible border-t ${borderSubtle} ${
                sidebarOpen ? 'px-3 py-3' : 'px-2 py-2'
            }`}
        >
            <div className={`flex ${sidebarOpen ? 'justify-end' : 'justify-center'}`}>
                <UserAccountMenu
                    auth={auth}
                    onLogout={onLogout}
                    surface="sidebar"
                    sidebarCompact={!sidebarOpen}
                    notificationCount={0}
                />
            </div>
            {chatCtx ? (
                <div className={`${sidebarOpen ? 'mt-4 border-t pt-4' : 'mt-3'} ${borderSubtle}`}>
                    <ChatWidget ctx={chatCtx} placement="sidebar" sidebarExpanded={sidebarOpen} isLight={isLight} />
                </div>
            ) : null}
        </div>
    );
}
