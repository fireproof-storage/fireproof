import React, { useEffect, useState } from "react";
import {
  ClerkFireproofProvider,
  useFireproofClerk,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@fireproof/clerk";

// Configuration from environment variables (set at build time via Vite)
const CONFIG = {
  apiUrl: import.meta.env.VITE_TOKEN_API_URI || "http://localhost:7370/api",
  cloudUrl: import.meta.env.VITE_CLOUD_BACKEND_URL || "fpcloud://localhost:8909?protocol=ws",
};

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_c2luY2VyZS1jaGVldGFoLTMwLmNsZXJrLmFjY291bnRzLmRldiQ";

interface Doc {
  _id: string;
  message?: string;
  author?: string;
  createdAt?: string;
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
    color: "#e4e4e7",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "40px 20px",
  },
  card: {
    maxWidth: 600,
    margin: "0 auto",
    background: "rgba(30, 30, 46, 0.8)",
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    border: "1px solid rgba(255, 255, 255, 0.1)",
    padding: 32,
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: 14,
    color: "#71717a",
    marginTop: 8,
  },
  userCard: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: 16,
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginBottom: 24,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
  },
  userEmail: {
    fontSize: 13,
    color: "#71717a",
  },
  statusBadge: (connected: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    background: connected ? "rgba(34, 197, 94, 0.2)" : "rgba(161, 161, 170, 0.2)",
    color: connected ? "#4ade80" : "#a1a1aa",
  }),
  statusDot: (connected: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: connected ? "#4ade80" : "#71717a",
    animation: connected ? "pulse 2s infinite" : "none",
  }),
  button: (primary: boolean, disabled: boolean) => ({
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 10,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s",
    background: primary
      ? disabled
        ? "linear-gradient(135deg, #4b5563 0%, #374151 100%)"
        : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      : "rgba(255, 255, 255, 0.1)",
    color: disabled ? "#6b7280" : "#fff",
    opacity: disabled ? 0.6 : 1,
  }),
  signInButton: {
    padding: "14px 32px",
    fontSize: 16,
    fontWeight: 600,
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    width: "100%",
  },
  docList: {
    background: "rgba(0, 0, 0, 0.3)",
    borderRadius: 12,
    padding: 16,
    maxHeight: 320,
    overflow: "auto",
  },
  docItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    marginBottom: 8,
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    border: "1px solid rgba(255, 255, 255, 0.05)",
    transition: "all 0.2s",
  },
  docMessage: {
    fontSize: 14,
    color: "#e4e4e7",
    marginBottom: 4,
  },
  docMeta: {
    fontSize: 11,
    color: "#71717a",
    display: "flex",
    gap: 8,
  },
  deleteButton: {
    background: "rgba(239, 68, 68, 0.2)",
    color: "#f87171",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    transition: "all 0.2s",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: 40,
    color: "#71717a",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  syncHint: {
    fontSize: 12,
    color: "#71717a",
    textAlign: "center" as const,
    marginTop: 12,
    fontStyle: "italic" as const,
  },
  footer: {
    marginTop: 32,
    paddingTop: 24,
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    fontSize: 12,
    color: "#52525b",
    textAlign: "center" as const,
  },
};

function CloudDemo() {
  const { user } = useUser();
  const [docs, setDocs] = useState<Doc[]>([]);

  // Use the new useFireproofClerk hook - handles auth and cloud sync automatically
  const { database, useLiveQuery, attachState, isSyncing } = useFireproofClerk("clerk-cloud-demo");

  // Live query for all docs
  const allDocs = useLiveQuery("_id");

  // Update docs state when live query changes
  useEffect(() => {
    const docsList = allDocs.docs.map((doc) => ({
      _id: doc._id,
      message: (doc as Doc).message,
      author: (doc as Doc).author,
      createdAt: (doc as Doc).createdAt,
    })).reverse();
    setDocs(docsList);
  }, [allDocs.docs]);

  async function handleAddDoc() {
    if (!user) return;
    await database.put({
      message: `Hello from ${user.firstName || "Anonymous"}`,
      author: user.fullName || user.primaryEmailAddress?.emailAddress || "Anonymous",
      createdAt: new Date().toISOString()
    });
  }

  async function handleDeleteDoc(id: string) {
    await database.del(id);
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
      `}</style>

      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>&#x1F525;</div>
          <h1 style={styles.title}>Fireproof Cloud</h1>
          <p style={styles.subtitle}>Real-time sync demo with Clerk authentication</p>
        </div>

        <SignedOut>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: "#a1a1aa", marginBottom: 24 }}>
              Sign in to start syncing documents across devices
            </p>
            <SignInButton mode="modal">
              <button style={styles.signInButton}>
                Sign In to Continue
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <div style={styles.userCard}>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: { width: 48, height: 48 }
                }
              }}
            />
            <div style={styles.userInfo}>
              <div style={styles.userName}>{user?.fullName || "User"}</div>
              <div style={styles.userEmail}>{user?.primaryEmailAddress?.emailAddress}</div>
            </div>
            <div style={styles.statusBadge(isSyncing)}>
              <div style={styles.statusDot(isSyncing)} />
              {isSyncing ? "Syncing" : attachState.status === "attaching" ? "Connecting" : "Offline"}
            </div>
          </div>

          {attachState.status === "error" && (
            <div style={{ padding: 16, background: "rgba(239, 68, 68, 0.1)", borderRadius: 10, marginBottom: 16, color: "#f87171", fontSize: 13 }}>
              {attachState.error?.message || "Connection error"}
            </div>
          )}

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={styles.sectionTitle}>
                <span>Live Documents</span>
                <span style={{ background: "rgba(102, 126, 234, 0.3)", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>
                  {docs.length}
                </span>
              </div>
              <button onClick={handleAddDoc} style={styles.button(true, false)}>
                + Add Document
              </button>
            </div>

            <div style={styles.docList}>
              {docs.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F4DD;</div>
                  <div>No documents yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Document" to create one</div>
                </div>
              ) : (
                docs.map(doc => (
                  <div key={doc._id} style={styles.docItem}>
                    <div>
                      <div style={styles.docMessage}>{doc.message}</div>
                      <div style={styles.docMeta}>
                        <span>{doc.author}</span>
                        <span>|</span>
                        <span>{doc.createdAt ? new Date(doc.createdAt).toLocaleTimeString() : ""}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDoc(doc._id)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>

            {isSyncing && (
              <p style={styles.syncHint}>
                Open this page in another tab or device to see real-time sync
              </p>
            )}
          </div>
        </SignedIn>

        <div style={styles.footer}>
          {CONFIG.cloudUrl.replace("fpcloud://", "").replace("?protocol=ws", "")}
        </div>
      </div>
    </div>
  );
}

export function DeviceIdDemo() {
  return (
    <ClerkFireproofProvider publishableKey={CLERK_KEY} config={CONFIG}>
      <CloudDemo />
    </ClerkFireproofProvider>
  );
}
