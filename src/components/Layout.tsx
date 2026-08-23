import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Menu, ChevronRight } from "lucide-react";
import { useLocation, matchPath, Link } from "react-router-dom";
import GlobalSearchModal from "./GlobalSearchModal";
import NotificationsDropdown from "./NotificationsDropdown";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const isServerView = matchPath("/servers/:id/*", location.pathname) && !matchPath("/servers/create", location.pathname);

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path === '/servers') return 'Servers';
    if (path === '/servers/create') return 'Deploy Server';
    if (path.startsWith('/servers/')) return 'Server Management';
    if (path === '/admin/servers') return 'Fleet';
    if (path === '/settings') return 'Settings';
    if (path === '/api-keys') return 'API Keys';
    return '';
  };

  if (isServerView) {
    return (
      <div className="snx-server-layout flex h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-indigo-500/30">
        <main className="flex-1 w-full h-full relative z-10 overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`snx-app-shell flex h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-indigo-500/30`}>
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      
      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 z-50 transform flex-shrink-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <Sidebar onClose={() => setMobileOpen(false)} isCollapsed={isCollapsed} toggleCollapse={() => setIsCollapsed(!isCollapsed)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative bg-transparent">
        
        {/* Top Header */}
        <header className="snx-global-topbar h-16 flex items-center justify-between px-4 sm:px-6 relative z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="snx-topbar-icon md:hidden p-2 -ml-2 rounded-lg">
              <Menu size={20} />
            </button>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="snx-topbar-icon hidden md:flex p-2 -ml-2 rounded-lg">
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="text-foreground">{getBreadcrumb()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <GlobalSearchModal />
            <NotificationsDropdown />
          </div>
        </header>
        
        {/* Main Content */}
        <main className={`snx-app-main flex-1 w-full h-full relative z-0 overflow-x-hidden overflow-y-auto pb-safe custom-scrollbar`}>
          <div className="snx-page-container p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
