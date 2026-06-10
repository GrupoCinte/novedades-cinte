export default function Layout({
    children,
    isLight = false
}) {
    const shell = isLight
        ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 text-slate-800 font-body'
        : 'flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0f172a] text-[var(--text)] font-body';
    const mainBg = isLight ? 'bg-slate-100' : 'bg-[#0f172a]';
    const contentPad = isLight ? 'bg-slate-50' : '';

    return (
        <div className={shell}>
            <main className={`flex min-h-0 flex-1 flex-col font-body ${mainBg}`}>
                <div className={`flex w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 md:px-8 md:py-6 min-h-0 ${contentPad}`}>
                    {children}
                </div>
            </main>
        </div>
    );
}
