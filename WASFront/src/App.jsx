import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import WhatsAppPage from './pages/WhatsAppPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
