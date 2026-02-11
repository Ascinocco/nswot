import JiraSetup from '../components/integrations/jira-setup';
import ConfluenceSetup from '../components/integrations/confluence-setup';
import GitHubSetup from '../components/integrations/github-setup';
import CodebaseSetup from '../components/integrations/codebase-setup';

export default function IntegrationsPage(): React.JSX.Element {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Integrations</h2>
      <div className="space-y-8 divide-y divide-gray-800">
        <JiraSetup />
        <div className="pt-8">
          <ConfluenceSetup />
        </div>
        <div className="pt-8">
          <GitHubSetup />
        </div>
        <div className="pt-8">
          <CodebaseSetup />
        </div>
      </div>
    </div>
  );
}
