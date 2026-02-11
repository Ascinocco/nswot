import { z } from 'zod';

export const profileInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().optional(),
  team: z.string().optional(),
  concerns: z.string().optional(),
  priorities: z.string().optional(),
  interviewQuotes: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export function validateProfileInput(
  data: unknown,
): { success: true; data: ProfileInput } | { success: false; errors: Record<string, string> } {
  const result = profileInputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as ProfileInput };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      errors[key] = issue.message;
    }
  }
  return { success: false, errors };
}
