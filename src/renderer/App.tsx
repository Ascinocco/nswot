import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import ErrorBoundary from './components/error-boundary';
import WorkspacePage from './routes/workspace';
import ProfilesPage from './routes/profiles';
import IntegrationsPage from './routes/integrations';
import AnalysisPage from './routes/analysis';
import AnalysisHistoryPage from './routes/analysis-history';
import ComparisonPage from './routes/comparison';
import ThemesPage from './routes/themes';
import SettingsPage from './routes/settings';

const NAV_ITEMS = [
  { to: '/', label: 'Workspace' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/history', label: 'History' },
  { to: '/comparison', label: 'Compare' },
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
            <Route path="/" element={<ErrorBoundary><WorkspacePage /></ErrorBoundary>} />
            <Route path="/profiles" element={<ErrorBoundary><ProfilesPage /></ErrorBoundary>} />
            <Route path="/integrations" element={<ErrorBoundary><IntegrationsPage /></ErrorBoundary>} />
            <Route path="/analysis" element={<ErrorBoundary><AnalysisPage /></ErrorBoundary>} />
            <Route path="/history" element={<ErrorBoundary><AnalysisHistoryPage /></ErrorBoundary>} />
            <Route path="/comparison" element={<ErrorBoundary><ComparisonPage /></ErrorBoundary>} />
            <Route path="/themes/:analysisId" element={<ErrorBoundary><ThemesPage /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
