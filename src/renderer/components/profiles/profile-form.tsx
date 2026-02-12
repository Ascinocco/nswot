import { useState } from 'react';
import { validateProfileInput } from '../../lib/validation';

interface ProfileFormProps {
  initialData?: ProfileInput;
  onSubmit: (data: ProfileInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function ProfileForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: ProfileFormProps): React.JSX.Element {
  const [name, setName] = useState(initialData?.name ?? '');
  const [role, setRole] = useState(initialData?.role ?? '');
  const [team, setTeam] = useState(initialData?.team ?? '');
  const [concerns, setConcerns] = useState(initialData?.concerns ?? '');
  const [priorities, setPriorities] = useState(initialData?.priorities ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [quotes, setQuotes] = useState<string[]>(initialData?.interviewQuotes ?? ['']);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleAddQuote(): void {
    setQuotes([...quotes, '']);
  }

  function handleRemoveQuote(index: number): void {
    setQuotes(quotes.filter((_, i) => i !== index));
  }

  function handleQuoteChange(index: number, value: string): void {
    const updated = [...quotes];
    updated[index] = value;
    setQuotes(updated);
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = tagInput.trim().replace(/,/g, '');
      if (value && !tags.includes(value)) {
        setTags([...tags, value]);
      }
      setTagInput('');
    }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function handleRemoveTag(tag: string): void {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const filteredQuotes = quotes.filter((q) => q.trim() !== '');
    // Flush any pending tag input
    const finalTags = [...tags];
    const pendingTag = tagInput.trim().replace(/,/g, '');
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }
    const data = {
      name,
      role: role || undefined,
      team: team || undefined,
      concerns: concerns || undefined,
      priorities: priorities || undefined,
      interviewQuotes: filteredQuotes.length > 0 ? filteredQuotes : undefined,
      tags: finalTags.length > 0 ? finalTags : undefined,
      notes: notes || undefined,
    };

    const result = validateProfileInput(data);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="Stakeholder name"
        />
        {errors['name'] && <p className="mt-1 text-xs text-red-400">{errors['name']}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Role</label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Staff Engineer"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Team</label>
          <input
            type="text"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Platform"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Tags</label>
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-gray-700 bg-gray-800 px-2 py-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-blue-400 hover:text-blue-200"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-white placeholder-gray-500 outline-none"
            placeholder={tags.length === 0 ? 'Type and press Enter to add tags...' : 'Add tag...'}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Concerns</label>
        <textarea
          value={concerns}
          onChange={(e) => setConcerns(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="Key concerns raised by this stakeholder..."
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Priorities</label>
        <textarea
          value={priorities}
          onChange={(e) => setPriorities(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="What this stakeholder considers most important..."
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Interview Quotes</label>
        <div className="space-y-2">
          {quotes.map((quote, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={quote}
                onChange={(e) => handleQuoteChange(index, e.target.value)}
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="Direct quote..."
              />
              <button
                type="button"
                onClick={() => handleRemoveQuote(index)}
                className="rounded px-2 text-gray-500 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddQuote}
          className="mt-2 text-sm text-blue-400 hover:text-blue-300"
        >
          + Add quote
        </button>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="Additional notes..."
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-800 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : initialData ? 'Update Profile' : 'Create Profile'}
        </button>
      </div>
    </form>
  );
}
