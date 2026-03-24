/// <reference types="@cloudflare/workers-types" />

export interface Env {
  QS_ROOM: DurableObjectNamespace;
  QS_DB_STORE: DurableObjectNamespace;
}
