import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import queryClient from '@/config/queryClient';
import { AuthProvider } from '@/auth/AuthProvider';
import { useAuth } from '@/auth/useAuth';
import { ProtectedRoute, RoleRoute } from '@/auth/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { PageSpinner } from '@/components/ui/Spinner';
import { ROLES } from '@/config/constants';

// ─── Lazy pages ───────────────────────────────────────────────────────────────
const Landing             = lazy(() => import('@/pages/Landing'));
const Login               = lazy(() => import('@/pages/auth/Login'));
const Register            = lazy(() => import('@/pages/auth/Register'));
const TracePassport       = lazy(() => import('@/pages/public/TracePassport'));

// Farmer
const FarmerDashboard     = lazy(() => import('@/pages/farmer/Dashboard'));
const FarmerListings      = lazy(() => import('@/pages/farmer/Listings'));
const CreateListing       = lazy(() => import('@/pages/farmer/CreateListing'));
const FarmerRequirements  = lazy(() => import('@/pages/farmer/Requirements'));
const FarmerBids          = lazy(() => import('@/pages/farmer/Bids'));

// Buyer
const BuyerDashboard      = lazy(() => import('@/pages/buyer/Dashboard'));
const Marketplace         = lazy(() => import('@/pages/buyer/Marketplace'));
const BuyerRequirements   = lazy(() => import('@/pages/buyer/Requirements'));
const CreateRequirement   = lazy(() => import('@/pages/buyer/CreateRequirement'));

// Shared protected
const ListingDetail       = lazy(() => import('@/pages/shared/ListingDetail'));
const RequirementDetail   = lazy(() => import('@/pages/shared/RequirementDetail'));
const Orders              = lazy(() => import('@/pages/shared/Orders'));
const OrderDetail         = lazy(() => import('@/pages/shared/OrderDetail'));
const OrderReceipt        = lazy(() => import('@/pages/shared/OrderReceipt'));
const Chat                = lazy(() => import('@/pages/shared/Chat'));
const Notifications       = lazy(() => import('@/pages/shared/Notifications'));
const Profile             = lazy(() => import('@/pages/shared/Profile'));
const Disputes             = lazy(() => import('@/pages/shared/Disputes'));

// Admin
const AdminDashboard      = lazy(() => import('@/pages/admin/Dashboard'));
const AdminManagement     = lazy(() => import('@/pages/admin/Management'));

// ─── Smart home redirect ──────────────────────────────────────────────────────
const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/" replace />;
  if (user.role === ROLES.FARMER) return <Navigate to="/farmer/dashboard" replace />;
  if (user.role === ROLES.BUYER) return <Navigate to="/buyer/dashboard" replace />;
  return <Navigate to="/admin/dashboard" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/home" element={<HomeRedirect />} />
            <Route path="/trace/:batchNumber" element={<TracePassport />} />

            {/* ─── FARMER ───────────────────────────────────────────── */}
            <Route
              path="/farmer"
              element={<RoleRoute roles={[ROLES.FARMER]}><AppLayout /></RoleRoute>}
            >
              <Route index element={<Navigate to="/farmer/dashboard" replace />} />
              <Route path="dashboard" element={<FarmerDashboard />} />
              <Route path="listings" element={<FarmerListings />} />
              <Route path="listings/new" element={<CreateListing />} />
              <Route path="requirements" element={<FarmerRequirements />} />
              <Route path="requirements/:id" element={<RequirementDetail />} />
              <Route path="bids" element={<FarmerBids />} />
              <Route path="orders" element={<Orders role={ROLES.FARMER} />} />
            </Route>

            {/* ─── BUYER ────────────────────────────────────────────── */}
            <Route
              path="/buyer"
              element={<RoleRoute roles={[ROLES.BUYER]}><AppLayout /></RoleRoute>}
            >
              <Route index element={<Navigate to="/buyer/dashboard" replace />} />
              <Route path="dashboard" element={<BuyerDashboard />} />
              <Route path="requirements" element={<BuyerRequirements />} />
              <Route path="requirements/new" element={<CreateRequirement />} />
              <Route path="requirements/:id" element={<RequirementDetail />} />
              <Route path="orders" element={<Orders role={ROLES.BUYER} />} />
            </Route>

            {/* ─── SHARED PROTECTED ─────────────────────────────────── */}
            <Route
              element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
            >
              <Route path="marketplace" element={<Marketplace />} />
              <Route path="marketplace/:id" element={<ListingDetail />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="orders/:id/receipt" element={<OrderReceipt />} />
              <Route path="chat" element={<Chat />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="disputes" element={<Disputes />} />
            </Route>

            {/* ─── ADMIN ────────────────────────────────────────────── */}
            <Route
              path="/admin"
              element={<RoleRoute roles={[ROLES.ADMIN]}><AppLayout /></RoleRoute>}
            >
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminManagement />} />
              <Route path="orders" element={<AdminManagement />} />
              <Route path="disputes" element={<AdminManagement />} />
            </Route>

            {/* Misc */}
            <Route path="/unauthorized" element={
              <div className="min-h-screen flex items-center justify-center text-center px-4">
                <div>
                  <p className="text-5xl mb-4">🔒</p>
                  <h1 className="font-display font-bold text-2xl text-gray-900 mb-2">Access Denied</h1>
                  <p className="text-gray-500 text-sm">You don't have permission to view this page.</p>
                </div>
              </div>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            borderRadius: '12px',
            padding: '12px 16px',
          },
          success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
        }}
      />
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
