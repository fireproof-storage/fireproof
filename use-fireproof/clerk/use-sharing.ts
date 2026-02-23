import { useCallback } from "react";
import { useClerkFireproofContext } from "./clerk-provider.js";
import type {
  QueryInviteTicket,
  InviteTicket,
  QueryUser,
  User,
} from "@fireproof/core-types-protocols-dashboard";
import type { DashboardApiImpl } from "@fireproof/core-protocols-dashboard";

export interface UseSharingResult {
  readonly ready: boolean;
  readonly dashApi: DashboardApiImpl<unknown> | null;
  readonly inviteUser: (ticket: QueryInviteTicket) => Promise<InviteTicket>;
  readonly listInvites: (opts?: { tenantIds?: string[]; ledgerIds?: string[] }) => Promise<InviteTicket[]>;
  readonly deleteInvite: (inviteId: string) => Promise<void>;
  readonly findUser: (query: QueryUser) => Promise<User[]>;
}

function unwrap<T>(result: { isErr(): boolean; Err(): Error; Ok(): T }): T {
  if (result.isErr()) {
    throw result.Err();
  }
  return result.Ok();
}

export function useSharing(): UseSharingResult {
  const { dashApi } = useClerkFireproofContext();
  const ready = dashApi !== null;

  const inviteUser = useCallback(
    async (ticket: QueryInviteTicket): Promise<InviteTicket> => {
      if (!dashApi) throw new Error("Dashboard API not ready");
      const result = await dashApi.inviteUser({ ticket });
      return unwrap(result).invite;
    },
    [dashApi]
  );

  const listInvites = useCallback(
    async (opts?: { tenantIds?: string[]; ledgerIds?: string[] }): Promise<InviteTicket[]> => {
      if (!dashApi) throw new Error("Dashboard API not ready");
      const result = await dashApi.listInvites(opts ?? {});
      return unwrap(result).tickets;
    },
    [dashApi]
  );

  const deleteInvite = useCallback(
    async (inviteId: string): Promise<void> => {
      if (!dashApi) throw new Error("Dashboard API not ready");
      const result = await dashApi.deleteInvite({ inviteId });
      unwrap(result);
    },
    [dashApi]
  );

  const findUser = useCallback(
    async (query: QueryUser): Promise<User[]> => {
      if (!dashApi) throw new Error("Dashboard API not ready");
      const result = await dashApi.findUser({ query });
      return unwrap(result).results;
    },
    [dashApi]
  );

  return { ready, dashApi, inviteUser, listInvites, deleteInvite, findUser };
}
