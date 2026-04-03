import { Routes, Route, Navigate } from 'react-router';
import ProtectedRoute from './components/ProtectedRoute';
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';
import OrgSetup from './pages/OrgSetup';
import UploadPage from './pages/UploadPage';
import MatchPage from './pages/MatchPage';

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/org-setup" element={
        <ProtectedRoute requireOrg={false}>
          <OrgSetup />
        </ProtectedRoute>
      } />
      <Route path="/" element={
        <ProtectedRoute requireOrg={true}>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/upload" element={
        <ProtectedRoute requireOrg={true}>
          <UploadPage />
        </ProtectedRoute>
      } />
      <Route path="/match" element={
        <ProtectedRoute requireOrg={true}>
          <MatchPage />
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
