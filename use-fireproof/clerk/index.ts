// Main hook
export { useFireproofClerk } from "./use-fireproof-clerk.js";

// Provider
export {
  ClerkFireproofProvider,
  useClerkFireproofContext,
  type ClerkFireproofProviderProps,
} from "./clerk-provider.js";

// Sharing hook
export { useSharing, type UseSharingResult } from "./use-sharing.js";

// Token strategy (for advanced use cases)
export { ClerkTokenStrategy } from "./clerk-token-strategy.js";

// Types
export type {
  ClerkCloudConfig,
  AttachState,
  AttachStatus,
  SyncStatus,
  UseFireproofClerkResult,
  ClerkContextValue,
} from "./types.js";

// Sharing types re-exported from dashboard protocols
export type {
  QueryInviteTicket,
  InviteTicket,
  InvitedParams,
  InviteTicketStatus,
  QueryUser,
  User,
  UserByProvider,
} from "@fireproof/core-protocols-dashboard";

// Re-export common types from use-fireproof for convenience
export type {
  Database,
  UseFireproof,
  UseLiveQuery,
  UseDocument,
  UseAllDocs,
  UseChanges,
} from "use-fireproof";

// Re-export Clerk components for convenience
export {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
  useClerk,
} from "@clerk/clerk-react";
