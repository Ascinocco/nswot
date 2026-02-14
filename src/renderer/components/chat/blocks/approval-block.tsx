import { useState, useCallback } from 'react';
import type { ApprovalBlockData } from '../../../../main/domain/content-block.types';
import ApprovalCard from '../../analysis/approval-card';
import FileApprovalCard from '../file-approval-card';

const FILE_TOOLS = new Set(['write_markdown_file', 'write_csv_file', 'write_mermaid_file', 'write_file']);

interface ApprovalBlockProps {
  data: ApprovalBlockData;
  conversationId: string | null;
}

export default function ApprovalBlock({
  data,
  conversationId,
}: ApprovalBlockProps): React.JSX.Element {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [resolved, setResolved] = useState(data.status !== 'pending');
  const [error, setError] = useState<string | null>(null);

  const analysisId = data.analysisId;

  const handleApprove = useCallback(async (id: string) => {
    setIsApproving(true);
    setError(null);
    try {
      const result = await window.nswot.chat.actions.approve(analysisId, id);
      if (result.success) {
        setResolved(true);
      } else {
        setError(result.error?.message ?? 'Failed to approve action');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve action');
    } finally {
      setIsApproving(false);
    }
  }, [analysisId]);

  const handleApproveAndRemember = useCallback(async (id: string) => {
    setIsApproving(true);
    setError(null);
    try {
      const result = await window.nswot.chat.actions.approve(analysisId, id);
      if (!result.success) {
        setError(result.error?.message ?? 'Failed to approve action');
        return;
      }
      if (conversationId) {
        const memResult = await window.nswot.approvalMemory.set(conversationId, data.toolName, true);
        if (!memResult.success) {
          console.warn('[approval-block] Failed to save approval memory:', memResult.error);
        }
      }
      setResolved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve action');
    } finally {
      setIsApproving(false);
    }
  }, [analysisId, conversationId, data.toolName]);

  const handleReject = useCallback(async (id: string) => {
    setIsRejecting(true);
    setError(null);
    try {
      const result = await window.nswot.chat.actions.reject(analysisId, id);
      if (result.success) {
        setResolved(true);
      } else {
        setError(result.error?.message ?? 'Failed to reject action');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject action');
    } finally {
      setIsRejecting(false);
    }
  }, [analysisId]);

  const handleEdit = useCallback(async (id: string, editedInput: Record<string, unknown>) => {
    setIsSavingEdit(true);
    setError(null);
    try {
      const result = await window.nswot.chat.actions.edit(id, editedInput);
      if (!result.success) {
        setError(result.error?.message ?? 'Failed to save edit');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save edit');
    } finally {
      setIsSavingEdit(false);
    }
  }, []);

  if (resolved) {
    return (
      <div className="my-2 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
        <span className="text-xs text-gray-400">
          Action {data.status === 'rejected' ? 'rejected' : 'approved'}
        </span>
      </div>
    );
  }

  const isFileTool = FILE_TOOLS.has(data.toolName);

  const card = isFileTool ? (
    <FileApprovalCard
      action={data}
      onApprove={handleApprove}
      onApproveAndRemember={conversationId ? handleApproveAndRemember : undefined}
      onReject={handleReject}
      onEdit={handleEdit}
      isApproving={isApproving}
      isRejecting={isRejecting}
      isEditing={isSavingEdit}
    />
  ) : (
    <ApprovalCard
      action={data}
      onApprove={handleApprove}
      onApproveAndRemember={conversationId ? handleApproveAndRemember : undefined}
      onReject={handleReject}
      onEdit={handleEdit}
      isApproving={isApproving}
      isRejecting={isRejecting}
      isEditing={isSavingEdit}
    />
  );

  return (
    <>
      {card}
      {error && (
        <div className="mt-1 rounded border border-red-800/50 bg-red-950/20 px-3 py-1.5 text-xs text-red-400">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
