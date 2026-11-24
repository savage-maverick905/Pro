import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import { ProtectedRoute } from './lib/auth';
import ComingSoon from './pages/ComingSoon';
import Discover from './pages/Discover';
import Dashboard from './pages/Dashboard';
import LeadDetail from './pages/LeadDetail';
import Leads from './pages/Leads';
import Login from './pages/Login';
import Outreach from './pages/Outreach';
import OutreachLead from './pages/OutreachLead';
import SettingsPage from './pages/Settings';
import Research from './pages/Research';
import ResearchReport from './pages/ResearchReport';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}><Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} /><Route path="leads/:id" element={<LeadDetail />} />
        <Route path="discover" element={<Discover />} />
        <Route path="research" element={<Research />} /><Route path="research/:id" element={<ResearchReport />} />
        <Route path="outreach" element={<Outreach />} /><Route path="outreach/:leadId" element={<OutreachLead />} />
        <Route path="analytics" element={<ComingSoon title="Analytics" phase={6} note="Discovery, outreach and conversion analytics." />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route></Route>
    </Routes>
  );
}
