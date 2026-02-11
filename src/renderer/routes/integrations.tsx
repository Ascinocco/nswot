import JiraSetup from '../components/integrations/jira-setup';

export default function IntegrationsPage(): React.JSX.Element {
  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">Integrations</h2>
      <JiraSetup />
    </div>
  );
}
