import { LogOut } from 'lucide-react';
import { useAuth } from './AuthContext';

/** Shown in the top bar: current user + role, and a sign-out button. */
export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight">
        <div className="text-[12px] font-medium text-text-primary">{user.name}</div>
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{user.role}</div>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        aria-label="Sign out"
        title="Sign out"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px] border border-border-tertiary bg-background-primary text-text-secondary hover:bg-background-tertiary"
      >
        <LogOut className="h-[14px] w-[14px]" strokeWidth={1.5} />
      </button>
    </div>
  );
}
