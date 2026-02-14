import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ConversationList from '../components/chat/conversation-list';
import AnalysisConfigPanel from '../components/chat/analysis-config-panel';
import type { AnalysisConfig } from '../components/chat/analysis-config-panel';
import PipelineProgress from '../components/chat/pipeline-progress';
import StatusBar from '../components/chat/status-bar';
import RichMessage from '../components/chat/rich-message';
import MemoryIndicator from '../components/chat/memory-indicator';
import PinnedSummary from '../components/chat/pinned-summary';
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useUpdateConversationTitle,
} from '../hooks/use-conversations';
import {
  useIntegration,
  useConfluenceIntegration,
  useGitHubIntegration,
} from '../hooks/use-integrations';
import {
  useAgentState,
  useTokenCount,
  useAgentThinking,
  useToolActivity,
  useStopAgent,
  useStreamSegments,
} from '../hooks/use-agent';
import type { ContentBlock } from '../hooks/use-agent';
import { CONTENT_BLOCK_TYPES } from '../../main/domain/content-block.types';

type PageState = 'list' | 'config' | 'running' | 'chat';

const AUTO_SYNC_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes

function isStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > AUTO_SYNC_FRESHNESS_MS;
}

const ROLE_LABELS: Record<string, string> = {
  staff_engineer: 'Staff Engineer',
  senior_em: 'Senior EM',
  vp_engineering: 'VP Engineering',
};

function ConfigSummary({ config }: {
  config: {
    role: string;
    modelId: string;
    config: { profileIds: string[]; jiraProjectKeys: string[]; confluenceSpaceKeys: string[]; githubRepos: string[]; codebaseRepos: string[] };
    completedAt: string | null;
  };
}): React.JSX.Element {
  const parts: string[] = [];
  parts.push(`Role: ${ROLE_LABELS[config.role] ?? config.role}`);
  // Show model short name (last segment after /)
  const modelShort = config.modelId.includes('/') ? config.modelId.split('/').pop()! : config.modelId;
  parts.push(`Model: ${modelShort}`);
  if (config.config.profileIds.length > 0) {
    parts.push(`${config.config.profileIds.length} profile${config.config.profileIds.length > 1 ? 's' : ''}`);
  }
  if (config.config.jiraProjectKeys.length > 0) {
    parts.push(`Jira: ${config.config.jiraProjectKeys.join(', ')}`);
  }
  if (config.config.confluenceSpaceKeys.length > 0) {
    parts.push(`Confluence: ${config.config.confluenceSpaceKeys.join(', ')}`);
  }
  if (config.config.githubRepos.length > 0) {
    parts.push(`GitHub: ${config.config.githubRepos.join(', ')}`);
  }
  if (config.config.codebaseRepos.length > 0) {
    parts.push(`Codebase: ${config.config.codebaseRepos.join(', ')}`);
  }

  return (
    <div className="rounded border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-xs text-gray-400">
      {parts.join(' \u00b7 ')}
    </div>
  );
}

interface ChatMessageDisplay {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  blocks?: ContentBlock[];
  /** If this message contains analysis results, the analysis ID */
  analysisId?: string;
  /** Error message for failed turns */
  error?: string;
}

export default function ChatAnalysisPage(): React.JSX.Element {
  const { conversationId: paramConversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  // Conversation state
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const updateTitle = useUpdateConversationTitle();

  // Integration state for auto-sync staleness check
  const { data: jiraIntegration } = useIntegration();
  const { data: confluenceIntegration } = useConfluenceIntegration();
  const { data: githubIntegration } = useGitHubIntegration();

  // Page state
  const [pageState, setPageState] = useState<PageState>(paramConversationId ? 'chat' : 'list');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    paramConversationId ?? null,
  );
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  // Agent state (scoped to active conversation)
  const agentState = useAgentState(activeConversationId);
  const tokenCount = useTokenCount(activeConversationId);
  const agentThinking = useAgentThinking(activeConversationId);
  const toolActivity = useToolActivity(activeConversationId);
  const stopAgent = useStopAgent();

  // Pipeline progress
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [pipelineVisible, setPipelineVisible] = useState(false);

  // History view: read-only config summary from loaded analysis
  const [savedAnalysisConfig, setSavedAnalysisConfig] = useState<{
    role: string;
    modelId: string;
    config: { profileIds: string[]; jiraProjectKeys: string[]; confluenceSpaceKeys: string[]; githubRepos: string[]; codebaseRepos: string[] };
    completedAt: string | null;
  } | null>(null);
  const [isFromHistory, setIsFromHistory] = useState(false);

  // Analysis IDs for pinned summaries (multiple re-runs within conversation)
  const [analysisIds, setAnalysisIds] = useState<string[]>([]);

  // Ordered streaming segments: interleaved text + blocks in arrival order
  const {
    segments: streamSegments,
    activeText: streamingText,
    allBlocks: agentBlocks,
    clear: clearStreamSegments,
  } = useStreamSegments(activeConversationId, analysisIds);

  // Model pricing for cost estimate
  const [modelPricing, setModelPricing] = useState<{ prompt: number; completion: number } | null>(null);

  // Selected model ID (stored from config panel when analysis runs)
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // Chat input
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resultsRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Track previous agent state to detect turn completion
  const prevAgentStateRef = useRef(agentState);

  // Finalize current turn into a message when agent goes idle or errors
  useEffect(() => {
    const wasActive = prevAgentStateRef.current !== 'idle' && prevAgentStateRef.current !== 'error';
    const isNowIdle = agentState === 'idle';
    const isNowError = agentState === 'error';

    if (wasActive && (isNowIdle || isNowError)) {
      const hasBlocks = agentBlocks.length > 0;
      const hasText = streamingText.trim().length > 0;
      // Collect all text from frozen segments + active text for the finalized message
      const allText = [
        ...streamSegments.filter((s) => s.type === 'text').map((s) => s.type === 'text' ? s.content : ''),
        streamingText,
      ].join('').trim();

      if (hasBlocks || hasText || allText.length > 0 || isNowError) {
        const assistantMsg: ChatMessageDisplay = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          blocks: hasBlocks ? [...agentBlocks] : undefined,
          text: allText || undefined,
          error: isNowError ? 'The agent encountered an error during this turn.' : undefined,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        clearStreamSegments();
      }
    }

    // Safety: always clear streaming segments when agent is in error state
    if (isNowError && (streamingText.length > 0 || streamSegments.length > 0) && !wasActive) {
      clearStreamSegments();
    }

    prevAgentStateRef.current = agentState;
  }, [agentState, agentBlocks, streamingText, streamSegments, clearStreamSegments]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, streamSegments, agentThinking]);

  // Listen for pipeline progress events
  useEffect(() => {
    const cleanup = window.nswot.analysis.onProgress((data) => {
      setCurrentStage(data.stage);
      setPipelineMessage(data.message);
      setCompletedStages((prev) =>
        prev.includes(data.stage) ? prev : [...prev, data.stage],
      );
    });
    return cleanup;
  }, []);

  // Auto-dismiss pipeline after completion (active flow only, not history)
  useEffect(() => {
    if (!completedStages.includes('completed') || isFromHistory) return;
    const timer = setTimeout(() => {
      setPipelineVisible(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [completedStages, isFromHistory]);

  // Streaming chunks are now handled by useStreamSegments hook

  // Sync URL param to state
  useEffect(() => {
    if (paramConversationId && paramConversationId !== activeConversationId) {
      setActiveConversationId(paramConversationId);
      setPageState('chat');
      setConfigCollapsed(true);
    }
  }, [paramConversationId, activeConversationId]);

  // Load messages from DB when resuming a conversation
  useEffect(() => {
    if (!activeConversationId || pageState !== 'chat') return;
    // Only load if we have no messages yet (fresh navigation)
    if (messages.length > 0) return;

    let cancelled = false;

    (async () => {
      try {
      // Find analyses linked to this conversation
      const analysisResult = await window.nswot.analysis.findByConversation(activeConversationId);
      if (cancelled || !analysisResult.success || !analysisResult.data) return;

      const analyses = analysisResult.data;
      if (analyses.length === 0) return;

      // Store analysis IDs
      setAnalysisIds(analyses.map((a) => a.id));

      // Store model ID from the latest analysis
      const latestAnalysis = analyses[analyses.length - 1]!;
      setSelectedModelId(latestAnalysis.modelId);

      // Populate history view state
      setIsFromHistory(true);
      setSavedAnalysisConfig({
        role: latestAnalysis.role,
        modelId: latestAnalysis.modelId,
        config: latestAnalysis.config,
        completedAt: latestAnalysis.completedAt,
      });
      setCompletedStages([
        'syncing', 'collecting', 'anonymizing', 'building_prompt',
        'sending', 'parsing', 'validating', 'storing', 'completed',
      ]);
      setPipelineVisible(true);

      // Load messages from all analyses
      const allMessages: ChatMessageDisplay[] = [];
      for (const analysis of analyses) {
        const msgResult = await window.nswot.chat.getMessages(analysis.id);
        if (cancelled) return;
        if (msgResult.success && msgResult.data) {
          const validTypes = new Set<string>(CONTENT_BLOCK_TYPES);
          for (const msg of msgResult.data) {
            if (msg.contentFormat === 'blocks') {
              try {
                const raw = JSON.parse(msg.content) as unknown[];
                const blocks = raw.filter(
                  (b): b is ContentBlock =>
                    typeof b === 'object' &&
                    b !== null &&
                    typeof (b as Record<string, unknown>).type === 'string' &&
                    validTypes.has((b as Record<string, unknown>).type as string) &&
                    typeof (b as Record<string, unknown>).id === 'string',
                );
                allMessages.push({
                  id: msg.id,
                  role: msg.role,
                  blocks,
                  analysisId: analysis.id,
                });
              } catch (err) {
                console.error('[chat-analysis] Failed to parse block content for message', msg.id, err);
                allMessages.push({ id: msg.id, role: msg.role, text: msg.content });
              }
            } else {
              allMessages.push({ id: msg.id, role: msg.role, text: msg.content });
            }
          }
        }
      }
      if (!cancelled) {
        setMessages(allMessages);
      }
      } catch (err) {
        if (!cancelled) {
          console.error('[chat-analysis] Failed to load conversation history:', err);
          setPageError('Failed to load conversation history');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [activeConversationId, pageState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch model pricing for cost estimate — match the selected model
  useEffect(() => {
    window.nswot.llm.listModels()
      .then((result) => {
        if (result.success && result.data) {
          const model = (selectedModelId
            ? result.data.find((m) => m.id === selectedModelId)
            : undefined) ?? result.data[0];
          if (model?.pricing) {
            setModelPricing(model.pricing);
          }
        }
      })
      .catch((err) => {
        console.warn('[chat-analysis] Failed to fetch model pricing:', err);
      });
  }, [selectedModelId]);

  // Handle selecting a conversation from the list
  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      setPageState('chat');
      setConfigCollapsed(true);
      navigate(`/chat-analysis/${id}`);
    },
    [navigate],
  );

  // Handle "New Analysis"
  const handleNewAnalysis = useCallback(() => {
    setActiveConversationId(null);
    setPageState('config');
    setConfigCollapsed(false);
    setMessages([]);
    clearStreamSegments();
    setCurrentStage(null);
    setCompletedStages([]);
    setPipelineError(null);
    setPipelineMessage(null);
    setPipelineVisible(false);
    setIsFromHistory(false);
    setSavedAnalysisConfig(null);
    setAnalysisIds([]);
    setPageError(null);
  }, [clearStreamSegments]);

  // Derived state
  const isAgentActive = agentState !== 'idle' && agentState !== 'error';

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Esc: stop agent
      if (e.key === 'Escape' && isAgentActive) {
        e.preventDefault();
        stopAgent();
      }
      // Cmd+N / Ctrl+N: new analysis
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleNewAnalysis();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isAgentActive, stopAgent, handleNewAnalysis]);

  // Handle "Run Analysis" (initial or re-run)
  const handleRunAnalysis = useCallback(
    async (config: AnalysisConfig) => {
      try {
        setIsRunning(true);
        setConfigCollapsed(true);
        setPageState('running');
        setCurrentStage(null);
        setCompletedStages([]);
        setPipelineError(null);
        setPipelineMessage(null);
        setPipelineVisible(true);
        setIsFromHistory(false);
        setSavedAnalysisConfig(null);
        clearStreamSegments();

        // Create conversation if this is a new one
        let convId = activeConversationId;
        if (!convId) {
          const conversation = await createConversation.mutateAsync(config.role);
          convId = conversation.id;
          setActiveConversationId(convId);
          navigate(`/chat-analysis/${convId}`, { replace: true });
        }

        // Store model ID for follow-up messages
        setSelectedModelId(config.modelId);

        // Auto-sync stale integrations before running analysis
        setCurrentStage('syncing');
        setPipelineMessage('Syncing integration data...');

        const syncPromises: Promise<unknown>[] = [];
        if (config.jiraProjectKeys.length > 0 && isStale(jiraIntegration?.lastSyncedAt ?? null)) {
          syncPromises.push(window.nswot.integrations.sync(config.jiraProjectKeys));
        }
        if (config.confluenceSpaceKeys.length > 0 && isStale(confluenceIntegration?.lastSyncedAt ?? null)) {
          syncPromises.push(window.nswot.confluence.sync(config.confluenceSpaceKeys));
        }
        if (config.githubRepos.length > 0 && isStale(githubIntegration?.lastSyncedAt ?? null)) {
          syncPromises.push(window.nswot.github.sync(config.githubRepos));
        }

        if (syncPromises.length > 0) {
          const results = await Promise.allSettled(syncPromises);
          const anyFailed = results.some((r) => r.status === 'rejected');
          if (anyFailed) {
            setPipelineMessage('Some sources could not be synced — using cached data');
          }
        }

        setCompletedStages(['syncing']);
        setCurrentStage(null);

        // Determine parentAnalysisId for re-runs
        const parentAnalysisId = analysisIds.length > 0 ? analysisIds[analysisIds.length - 1] : undefined;

        // Run the analysis via the existing analysis IPC
        const result = await window.nswot.analysis.run({
          profileIds: config.profileIds,
          jiraProjectKeys: config.jiraProjectKeys,
          confluenceSpaceKeys: config.confluenceSpaceKeys,
          githubRepos: config.githubRepos,
          codebaseRepos: config.codebaseRepos,
          role: config.role,
          modelId: config.modelId,
          contextWindow: config.contextWindow,
          conversationId: convId!,
          parentAnalysisId,
        });

        if (result.success && result.data) {
          setPageState('chat');
          // Track analysis ID for pinned summary
          setAnalysisIds((prev) => [...prev, result.data!.id]);
        } else {
          setPipelineError(result.error?.message ?? 'Analysis failed');
        }
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Analysis failed');
      } finally {
        setIsRunning(false);
      }
    },
    [activeConversationId, analysisIds, createConversation, navigate, clearStreamSegments, jiraIntegration, confluenceIntegration, githubIntegration],
  );

  // Handle re-run: show config panel for re-configuration
  const handleReRun = useCallback(() => {
    setPageState('config');
    setConfigCollapsed(false);
    setSavedAnalysisConfig(null);
  }, []);

  // Handle sending a follow-up message
  const handleSendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || !activeConversationId || analysisIds.length === 0) return;

    setInput('');
    clearStreamSegments();

    const userMsg: ChatMessageDisplay = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: content,
    };
    setMessages((prev) => [...prev, userMsg]);

    const latestAnalysisId = analysisIds[analysisIds.length - 1]!;
    try {
      const result = await window.nswot.agent.send({
        conversationId: activeConversationId,
        analysisId: latestAnalysisId,
        modelId: selectedModelId || 'anthropic/claude-sonnet-4-5-20250929',
        content,
      });
      if (!result.success) {
        setPageError(result.error?.message ?? 'Failed to send message');
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [input, activeConversationId, analysisIds, selectedModelId, clearStreamSegments]);

  // Handle keyboard shortcut for send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  // Handle deleting a conversation
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation.mutateAsync(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setPageState('list');
        navigate('/chat-analysis');
      }
    },
    [activeConversationId, deleteConversation, navigate],
  );

  // Handle renaming a conversation
  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      await updateTitle.mutateAsync({ id, title });
    },
    [updateTitle],
  );

  // Handle back to list
  const handleBack = useCallback(() => {
    setActiveConversationId(null);
    setPageState('list');
    setMessages([]);
    clearStreamSegments();
    setAnalysisIds([]);
    setPipelineVisible(false);
    setIsFromHistory(false);
    setSavedAnalysisConfig(null);
    setPageError(null);
    navigate('/chat-analysis');
  }, [navigate, clearStreamSegments]);

  // Handle jump to results
  const handleJumpToResults = useCallback((analysisId: string) => {
    const el = resultsRefs.current.get(analysisId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // --- Render ---

  const hasCurrentTurnContent =
    agentBlocks.length > 0 || streamingText.length > 0 || streamSegments.length > 0 || agentThinking != null;

  // State: conversation list
  if (pageState === 'list') {
    return (
      <ConversationList
        conversations={conversations ?? []}
        isLoading={conversationsLoading}
        onSelect={handleSelectConversation}
        onNew={handleNewAnalysis}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />
    );
  }

  // States: config, running, chat
  return (
    <div className="flex h-full flex-col">
      {/* Header with back button + re-run */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-white">
          {pageState === 'config' ? 'New Analysis' : 'Analysis'}
        </h2>
        {(pageState === 'chat' || pageState === 'running') && (
          <button
            onClick={handleReRun}
            className="ml-auto rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            Re-run with different settings
          </button>
        )}
      </div>

      {/* Page-level error banner */}
      {pageError && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-2.5 text-sm text-red-400">
          <span>{pageError}</span>
          <button
            onClick={() => setPageError(null)}
            className="ml-4 text-xs text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Config panel — only in config state */}
      {pageState === 'config' && (
        <AnalysisConfigPanel
          collapsed={configCollapsed}
          onToggle={() => setConfigCollapsed(!configCollapsed)}
          onRun={handleRunAnalysis}
          isRunning={isRunning}
        />
      )}

      {/* Read-only config summary — history view only */}
      {savedAnalysisConfig && pageState === 'chat' && (
        <ConfigSummary config={savedAnalysisConfig} />
      )}

      {/* Pipeline progress — visible during run and briefly after completion */}
      {pipelineVisible && (
        <div className="mt-3">
          <PipelineProgress
            currentStage={currentStage}
            completedStages={completedStages}
            error={pipelineError}
            message={pipelineMessage}
          />
        </div>
      )}

      {/* Status bar + memory indicator + pinned summary */}
      {pageState !== 'config' && (isAgentActive || tokenCount.input + tokenCount.output > 0) && (
        <div className="mt-2 space-y-1.5">
          <StatusBar
            agentState={agentState}
            tokenCount={tokenCount}
            toolActivity={toolActivity}
            onStop={stopAgent}
            modelPricing={modelPricing}
          />
          <div className="flex items-center gap-2">
            <MemoryIndicator conversationId={activeConversationId} />
            <PinnedSummary
              analysisIds={analysisIds}
              onJumpToResults={handleJumpToResults}
            />
          </div>
        </div>
      )}

      {/* Chat area */}
      {(pageState === 'running' || pageState === 'chat') && (
        <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Empty conversation placeholder */}
            {messages.length === 0 && !isAgentActive && !hasCurrentTurnContent && pageState === 'chat' && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-900/30">
                  <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400">No messages yet.</p>
                <p className="mt-1 text-xs text-gray-500">
                  Ask a follow-up question or re-run the analysis with different settings.
                </p>
              </div>
            )}

            {/* Finalized messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                ref={msg.analysisId ? (el) => {
                  if (el) resultsRefs.current.set(msg.analysisId!, el);
                } : undefined}
              >
                <RichMessage
                  role={msg.role}
                  text={msg.text}
                  blocks={msg.blocks}
                  conversationId={activeConversationId}
                />
                {msg.error && (
                  <div className="mt-1 ml-10 rounded border border-red-800/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                    {msg.error}
                    <button
                      onClick={() => {
                        // Retry: re-send the last user message before this error
                        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
                        if (lastUserMsg?.text && activeConversationId && analysisIds.length > 0) {
                          clearStreamSegments();
                          const latestAnalysisId = analysisIds[analysisIds.length - 1]!;
                          window.nswot.agent.send({
                            conversationId: activeConversationId,
                            analysisId: latestAnalysisId,
                            modelId: selectedModelId || 'anthropic/claude-sonnet-4-5-20250929',
                            content: lastUserMsg.text,
                          });
                        }
                      }}
                      className="ml-2 text-blue-400 hover:text-blue-300 underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Current turn: agent is active or has produced content not yet finalized */}
            {(isAgentActive || hasCurrentTurnContent) && (
              <RichMessage
                role="assistant"
                segments={streamSegments.length > 0 ? streamSegments : undefined}
                streamingThinking={agentThinking ?? undefined}
                toolActivity={toolActivity ?? undefined}
                streamingText={streamingText || undefined}
                conversationId={activeConversationId}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-800 p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question..."
                rows={1}
                className="flex-1 resize-none rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || agentState !== 'idle'}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </div>
            <div className="mt-1 flex gap-3 text-[10px] text-gray-600">
              <span>Enter to send</span>
              <span>Shift+Enter for newline</span>
              {isAgentActive && <span>Esc to stop</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
