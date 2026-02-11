import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import WorkspacePage from './routes/workspace';
import ProfilesPage from './routes/profiles';
import IntegrationsPage from './routes/integrations';
import AnalysisPage from './routes/analysis';
import AnalysisHistoryPage from './routes/analysis-history';
import SettingsPage from './routes/settings';

const NAV_ITEMS = [
  { to: '/', label: 'Workspace' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
] as const;

export default function App(): React.JSX.Element {
  return (
    <HashRouter>
      <div className="flex h-screen bg-gray-950 text-gray-100">
        <nav className="flex w-52 shrink-0 flex-col border-r border-gray-800 bg-gray-900 p-4">
          <h1 className="mb-6 text-lg font-bold tracking-tight text-white">nswot</h1>
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `block rounded px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-gray-800 text-white font-medium'
                        : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<WorkspacePage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/history" element={<AnalysisHistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
