import { z } from 'zod';
import type { Policy, Principal } from '../rbac.js';

export const loginInput = z.object({ passphrase: z.string().min(1).max(256) });
export type LoginInput = z.infer<typeof loginInput>;

export interface Me {
  principal: Principal;
  policy: Policy;
  session: { id: string; expiresAt: string; createdAt: string };
}
