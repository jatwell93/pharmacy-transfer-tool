import { useAuth } from '@clerk/react';
import { Navigate } from 'react-router';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOrg: boolean;
}

export default function ProtectedRoute({ children, requireOrg }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded, orgId } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (requireOrg && !orgId) {
    return <Navigate to="/org-setup" replace />;
  }

  return <>{children}</>;
}
