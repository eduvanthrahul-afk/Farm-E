import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Leaf, LayoutDashboard, List, ClipboardList, ShoppingBag,
  MessageSquare, Bell, User, LogOut, Menu, X,
  Gavel, Package, BarChart3, Search, Plus, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { ROLES } from '@/config/constants';
import { initials } from '@/utils/format';
import { clsx } from 'clsx';
import { notificationsApi } from '@/api/index';

const farmerNav = [
  { label: 'Overview', href: '/farmer/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'My listings', href: '/farmer/listings', icon: List },
  { label: 'Buyer requirements', href: '/farmer/requirements', icon: ClipboardList },
  { label: 'My bids', href: '/farmer/bids', icon: Gavel },
  { label: 'Orders', href: '/farmer/orders', icon: Package },
  { label: 'Disputes', href: '/disputes', icon: ShieldAlert },
  { label: 'Messages', href: '/chat', icon: MessageSquare },
];
const buyerNav = [
  { label: 'Overview', href: '/buyer/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
  { label: 'My requirements', href: '/buyer/requirements', icon: ClipboardList },
  { label: 'Orders', href: '/buyer/orders', icon: Package },
  { label: 'Disputes', href: '/disputes', icon: ShieldAlert },
  { label: 'Messages', href: '/chat', icon: MessageSquare },
];
const adminNav = [
  { label: 'Overview', href: '/admin/dashboard', icon: BarChart3, exact: true },
  { label: 'Users', href: '/admin/users', icon: User },
  { label: 'Orders', href: '/admin/orders', icon: Package },
  { label: 'Disputes', href: '/admin/disputes', icon: ClipboardList },
];
const navByRole = { FARMER: farmerNav, BUYER: buyerNav, ADMIN: adminNav };

const Sidebar = ({ mobile, onClose }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const nav = navByRole[user?.role] || [];
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <aside className={clsx('app-sidebar flex flex-col h-full', mobile && 'app-sidebar-mobile fixed inset-y-0 left-0 z-50 animate-slide-up')}>
      <div className="brand-lockup">
        <Link to="/home" onClick={onClose} className="brand-mark"><Leaf size={20} strokeWidth={2.4} /></Link>
        <div className="brand-copy">
          <Link to="/home" onClick={onClose} className="brand-name">Farm<span>-E</span></Link>
          <span className="brand-caption">DIRECT MARKET</span>
        </div>
        {mobile && <button onClick={onClose} aria-label="Close menu" className="ml-auto p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-1" aria-label="Main navigation">
        <div className="sidebar-nav-heading">WORKSPACE</div>
        {nav.map(({ label, href, icon: Icon, exact }) => {
          const active = exact ? location.pathname === href : location.pathname === href || location.pathname.startsWith(`${href}/`);
          return <Link key={href} to={href} onClick={onClose} aria-current={active ? 'page' : undefined} className={active ? 'nav-item-active' : 'nav-item'}>
            <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />{label}{active && <span className="nav-active-mark" />}
          </Link>;
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-bottom-heading">ACCOUNT</div>
        <div className="sidebar-account-links">
          <Link to="/notifications" onClick={onClose} className={location.pathname === '/notifications' ? 'nav-item-active' : 'nav-item'}><Bell size={18} />Notifications</Link>
          <Link to="/profile" onClick={onClose} className={location.pathname === '/profile' ? 'nav-item-active' : 'nav-item'}><User size={18} />Profile</Link>
        </div>
        <button onClick={handleLogout} className="nav-item w-full nav-logout"><LogOut size={18} />Sign out</button>
        <div className="sidebar-user">
          <div className="user-avatar">{initials(user?.name)}</div>
          <div className="flex-1 min-w-0"><p className="user-name truncate">{user?.name}</p><p className="user-email truncate">{user?.email}</p></div>
          <span className="online-dot" title="Signed in" />
        </div>
      </div>
    </aside>
  );
};

const pageNames = {
  '/farmer/dashboard': 'Overview', '/buyer/dashboard': 'Overview', '/admin/dashboard': 'Overview',
  '/farmer/listings': 'My listings', '/farmer/requirements': 'Buyer requirements', '/farmer/bids': 'My bids',
  '/farmer/listings/new': 'New listing', '/buyer/requirements': 'My requirements',
  '/buyer/requirements/new': 'New requirement', '/marketplace': 'Marketplace', '/chat': 'Messages',
  '/profile': 'Your profile', '/notifications': 'Notifications', '/farmer/orders': 'Orders', '/buyer/orders': 'Orders', '/disputes': 'Dispute center',
  '/admin/users': 'User management', '/admin/orders': 'Order management', '/admin/disputes': 'Dispute management',
};

export const AppLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { data: unreadNotifications = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.getAll({ unread: 'true', limit: 1 }),
    select: (response) => response.data.data.unreadCount || 0,
    enabled: Boolean(user),
    refetchInterval: 30000,
  });
  const pageName = pageNames[location.pathname] || (location.pathname.includes('/orders/') ? 'Order details' : location.pathname.includes('/marketplace/') ? 'Listing details' : location.pathname.includes('/requirements/') ? 'Requirement details' : 'Farm-E workspace');
  const quickAction = user?.role === ROLES.FARMER
    ? { label: 'New listing', href: '/farmer/listings/new' }
    : user?.role === ROLES.BUYER
      ? { label: 'New requirement', href: '/buyer/requirements/new' }
      : null;
  const exploreLabel = user?.role === ROLES.FARMER ? 'Browse requirements' : 'Find produce';
  const exploreHref = user?.role === ROLES.FARMER ? '/farmer/requirements' : '/marketplace';

  return (
    <div className="app-shell flex h-screen">
      <div className="hidden lg:flex"><Sidebar /></div>
      {mobileOpen && <><button aria-label="Close navigation" className="mobile-scrim fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)} /><Sidebar mobile onClose={() => setMobileOpen(false)} /></>}
      <div className="app-main flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="app-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="mobile-menu lg:hidden"><Menu size={20} /></button>
            <div className="min-w-0"><p className="topbar-eyebrow">{pageName.toUpperCase()}</p><h1 className="topbar-title truncate">Farm-E workspace</h1></div>
          </div>
          <div className="topbar-actions">
            <Link to={exploreHref} className="topbar-search" aria-label={exploreLabel}><Search size={16} /><span>{exploreLabel}</span></Link>
            <Link to="/notifications" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`} className="topbar-icon"><Bell size={18} />{unreadNotifications > 0 && <span className="topbar-notification-dot" />}</Link>
            {quickAction && <Link to={quickAction.href} className="topbar-create"><Plus size={15} /><span>{quickAction.label}</span></Link>}
            <Link to="/profile" className="topbar-avatar" title={user?.name}>{initials(user?.name)}</Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto app-content"><Outlet /></main>
      </div>
    </div>
  );
};
