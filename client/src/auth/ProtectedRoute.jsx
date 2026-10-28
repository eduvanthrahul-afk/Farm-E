import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

// Requires authentication
export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // AuthProvider handles global loading
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
};

// Requires specific role(s)
export const RoleRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};
