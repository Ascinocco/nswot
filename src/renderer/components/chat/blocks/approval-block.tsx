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

  const analysisId = data.analysisId;
  const actionId = data.id;

  const handleApprove = useCallback(async (id: string) => {
    setIsApproving(true);
    try {
      await window.nswot.chat.actions.approve(analysisId, id);
      setResolved(true);
    } finally {
      setIsApproving(false);
    }
  }, [analysisId]);

  const handleApproveAndRemember = useCallback(async (id: string) => {
    setIsApproving(true);
    try {
      await window.nswot.chat.actions.approve(analysisId, id);
      if (conversationId) {
        await window.nswot.approvalMemory.set(conversationId, data.toolName, true);
      }
      setResolved(true);
    } finally {
      setIsApproving(false);
    }
  }, [analysisId, conversationId, data.toolName]);

  const handleReject = useCallback(async (id: string) => {
    setIsRejecting(true);
    try {
      await window.nswot.chat.actions.reject(analysisId, id);
      setResolved(true);
    } finally {
      setIsRejecting(false);
    }
  }, [analysisId]);

  const handleEdit = useCallback(async (id: string, editedInput: Record<string, unknown>) => {
    setIsSavingEdit(true);
    try {
      await window.nswot.chat.actions.edit(id, editedInput);
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

  if (isFileTool) {
    return (
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
    );
  }

  return (
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
}
