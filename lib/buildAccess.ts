import { supabase } from './supabase';

export type BuildRole = 'owner' | 'partner' | 'contractor' | 'viewer';

export type BuildPermissionKey =
  | 'view_budget'
  | 'view_documents'
  | 'add_photos'
  | 'add_journal'
  | 'add_expenses'
  | 'manage_tasks';

export type BuildPermissions = Record<BuildPermissionKey, boolean>;

export type BuildAccess = {
  role: BuildRole;
  investmentId: string;
  investmentName: string | null;
  permissions: BuildPermissions;
  source: 'owner' | 'member';
  ownerUserId: string | null;
};

type BuildPermissionItem = {
  key: BuildPermissionKey;
  icon: string;
};

export const BUILD_PERMISSION_ITEMS: BuildPermissionItem[] = [
  { key: 'view_budget', icon: 'pie-chart' },
  { key: 'view_documents', icon: 'file-text' },
  { key: 'add_photos', icon: 'camera' },
  { key: 'add_journal', icon: 'edit-3' },
  { key: 'add_expenses', icon: 'credit-card' },
  { key: 'manage_tasks', icon: 'check-square' },
];

export const DEFAULT_BUILD_PERMISSIONS: BuildPermissions = {
  view_budget: true,
  view_documents: true,
  add_photos: true,
  add_journal: true,
  add_expenses: false,
  manage_tasks: false,
};

export const VIEW_ONLY_BUILD_PERMISSIONS: BuildPermissions = {
  view_budget: true,
  view_documents: true,
  add_photos: false,
  add_journal: false,
  add_expenses: false,
  manage_tasks: false,
};

export const COLLABORATION_BUILD_PERMISSIONS: BuildPermissions = {
  view_budget: true,
  view_documents: true,
  add_photos: true,
  add_journal: true,
  add_expenses: true,
  manage_tasks: false,
};

export function normalizeBuildPermissions(raw: unknown): BuildPermissions {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    view_budget: source.view_budget === true,
    view_documents: source.view_documents === true,
    add_photos: source.add_photos === true,
    add_journal: source.add_journal === true,
    add_expenses: source.add_expenses === true,
    manage_tasks: source.manage_tasks === true,
  };
}

export function normalizeBuildRole(raw: unknown): BuildRole | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'owner' || value === 'partner' || value === 'contractor' || value === 'viewer') {
    return value;
  }
  return null;
}

export function getPermissionPreset(permissions: BuildPermissions): 'view' | 'collab' | 'custom' {
  const isViewOnly = BUILD_PERMISSION_ITEMS.every(
    (item) => permissions[item.key] === VIEW_ONLY_BUILD_PERMISSIONS[item.key]
  );
  if (isViewOnly) return 'view';

  const isCollaboration = BUILD_PERMISSION_ITEMS.every(
    (item) => permissions[item.key] === COLLABORATION_BUILD_PERMISSIONS[item.key]
  );
  if (isCollaboration) return 'collab';

  return 'custom';
}

export function isNonOwnerBuildRole(role: BuildRole | null): boolean {
  return !!role && role !== 'owner';
}

export async function fetchCurrentBuildAccess(userId: string): Promise<BuildAccess | null> {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) return null;

  const [memberRes, ownerRes] = await Promise.all([
    supabase
      .from('investment_members')
      .select('investment_id,role,permissions')
      .eq('user_id', normalizedUserId)
      .maybeSingle(),
    supabase
      .from('inwestycje')
      .select('id,nazwa,user_id')
      .eq('user_id', normalizedUserId)
      .maybeSingle(),
  ]);

  if (memberRes.error) throw memberRes.error;
  if (ownerRes.error) throw ownerRes.error;

  const memberRole = normalizeBuildRole(memberRes.data?.role);
  if (memberRes.data?.investment_id && memberRole) {
    return {
      role: memberRole,
      investmentId: String(memberRes.data.investment_id),
      investmentName: null,
      permissions: normalizeBuildPermissions(memberRes.data.permissions),
      source: 'member',
      ownerUserId: String(ownerRes.data?.user_id ?? '') || null,
    };
  }

  if (ownerRes.data?.id) {
    return {
      role: 'owner',
      investmentId: String(ownerRes.data.id),
      investmentName: String(ownerRes.data.nazwa ?? '') || null,
      permissions: { ...DEFAULT_BUILD_PERMISSIONS },
      source: 'owner',
      ownerUserId: normalizedUserId,
    };
  }

  return null;
}
