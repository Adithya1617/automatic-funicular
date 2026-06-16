import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { userRepository } from '../repositories/userRepository';
import { sessionRepository } from '../repositories/sessionRepository';
import type { UserRow } from '../db/schema';
import type { AuthUser, CreateUserInput } from '@shared/schemas/auth';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

/** Session lifetime (7 days) and bcrypt work factor. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

// A valid-format bcrypt hash that no password matches — compared against when
// the email is unknown so login timing doesn't reveal whether the user exists.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DhxU0pq1m0u3M2y2y2y2y2y2y2y2.';

function toAuthUser(u: UserRow): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export type LoginResult = { user: AuthUser; token: string; expiresAt: number };

export const AuthService = {
  /**
   * Verify credentials and open a server-side session. Returns the opaque
   * session token (stored as `sessions.id`, carried by the httpOnly cookie).
   * Throws a generic ValidationError on any failure so we never reveal whether
   * an email exists.
   */
  async login(
    db: AppDb,
    tenantId: number,
    email: string,
    password: string,
  ): Promise<LoginResult> {
    const user = await userRepository.findByEmail(db, tenantId, email.trim().toLowerCase());
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.isActive || !ok) {
      throw new ValidationError('Invalid email or password');
    }
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    await sessionRepository.insert(db, {
      id: token,
      tenantId,
      userId: user.id,
      createdAt: now,
      expiresAt,
    });
    return { user: toAuthUser(user), token, expiresAt };
  },

  /** Resolve a session token to its user, or null if missing/expired/inactive. */
  async validateSession(db: AppDb, token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const session = await sessionRepository.findById(db, token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      await sessionRepository.deleteById(db, token);
      return null;
    }
    const user = await userRepository.findById(db, session.tenantId, session.userId);
    if (!user || !user.isActive) return null;
    return toAuthUser(user);
  },

  async logout(db: AppDb, token: string | undefined): Promise<void> {
    if (token) await sessionRepository.deleteById(db, token);
  },

  async listUsers(db: AppDb, tenantId: number): Promise<AuthUser[]> {
    const rows = await userRepository.list(db, tenantId);
    return rows.map(toAuthUser);
  },

  async createUser(
    db: AppDb,
    tenantId: number,
    input: CreateUserInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    const dup = await userRepository.findByEmail(db, tenantId, email);
    if (dup) {
      throw new ConflictError(`A user with email "${email}" already exists`, {
        email: 'duplicate',
      });
    }
    const now = Date.now();
    const row = await userRepository.insert(db, {
      id: newId(),
      tenantId,
      email,
      name: input.name,
      passwordHash: bcrypt.hashSync(input.password, BCRYPT_ROUNDS),
      role: input.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return toAuthUser(row);
  },

  async deactivateUser(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<AuthUser> {
    const existing = await userRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('User', id);
    const row = await userRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('User', id);
    return toAuthUser(row);
  },

  /** Change one's own password (verifies the current password first). */
  async changePassword(
    db: AppDb,
    tenantId: number,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await userRepository.findById(db, tenantId, userId);
    if (!user) throw new NotFoundError('User', userId);
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new ValidationError('Current password is incorrect');
    await userRepository.update(db, tenantId, userId, {
      passwordHash: bcrypt.hashSync(newPassword, BCRYPT_ROUNDS),
      updatedAt: Date.now(),
      updatedBy: userId,
    });
  },
};
