import { z } from 'zod';

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['owner', 'staff']),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const deactivateUserInputSchema = z.object({ id: z.string().uuid() });
export type DeactivateUserInput = z.infer<typeof deactivateUserInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export type UserRole = 'owner' | 'staff';

/** The public shape of a user — never includes the password hash. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
