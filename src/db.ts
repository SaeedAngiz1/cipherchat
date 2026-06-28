/// <reference types="vite/client" />
/**
 * Backend abstraction layer.
 *
 * The app talks to `db` (selected below) rather than directly to storage.ts.
 * By default we use the localStorage adapter. When the Supabase env vars
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present (and non-empty),
 * the Supabase adapter is used — that's the swap-in path for real
 * cross-device sync.
 *
 * To enable Supabase in production:
 *   1. Create a Supabase project.
 *   2. Run the SQL in `supabase/schema.sql` to provision tables + RLS.
 *   3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
 *   4. Fill in the `SupabaseDB` methods below (currently stubs that throw).
 */

import type {
  Group,
  GroupId,
  GroupKeyEnvelope,
  KeypairRecord,
  Message,
  MessageId,
  User,
  UserId,
} from './types'
import * as local from './storage'

/** Backend selection result of the env vars. */
export type BackendName = 'local' | 'supabase'

/* ============================================================
   Unified Database interface
   ============================================================ */

export interface Database {
  /** Authenticated current user id, or null. */
  getSession(): Promise<UserId | null>
  setSession(userId: UserId): Promise<void>
  clearSession(): Promise<void>

  /* users */
  listUsers(): Promise<User[]>
  getUser(id: UserId): Promise<User | undefined>
  getUserByUsername(username: string): Promise<User | undefined>
  createUser(u: User): Promise<User>
  updateUser(u: User): Promise<void>
  isUsernameTaken(username: string): Promise<boolean>

  /* groups */
  listGroups(): Promise<Group[]>
  getGroup(id: GroupId): Promise<Group | undefined>
  getGroupByCode(code: string): Promise<Group | undefined>
  createGroup(g: Group): Promise<Group>
  updateGroup(g: Group): Promise<void>
  listGroupsForUser(userId: UserId): Promise<Group[]>

  /* messages */
  listMessages(): Promise<Message[]>
  addMessage(m: Message): Promise<void>
  listDmBetween(a: UserId, b: UserId): Promise<Message[]>
  listForGroup(groupId: GroupId): Promise<Message[]>

  /* keypairs */
  getKeypair(userId: UserId): Promise<KeypairRecord | undefined>
  upsertKeypair(rec: KeypairRecord): Promise<void>

  /* group-key envelopes */
  listGroupKeysForUser(userId: UserId): Promise<GroupKeyEnvelope[]>
  upsertGroupKey(env: GroupKeyEnvelope): Promise<void>

  /** Stable unique id generator used by both adapters. */
  newId(prefix: string): Promise<string>
}

/* ============================================================
   LocalStorage adapter (default, fully working)
   ============================================================ */

const localDb: Database = {
  async getSession() {
    return local.Session.get()
  },
  async setSession(userId) {
    local.Session.set(userId)
  },
  async clearSession() {
    local.Session.clear()
  },
  async listUsers() {
    return local.Users.all()
  },
  async getUser(id) {
    return local.Users.byId(id)
  },
  async getUserByUsername(username) {
    return local.Users.byUsername(username)
  },
  async createUser(u) {
    return local.Users.create(u)
  },
  async updateUser(u) {
    local.Users.update(u)
  },
  async isUsernameTaken(username) {
    return local.Users.isUsernameTaken(username)
  },
  async listGroups() {
    return local.Groups.all()
  },
  async getGroup(id) {
    return local.Groups.byId(id)
  },
  async getGroupByCode(code) {
    return local.Groups.byCode(code)
  },
  async createGroup(g) {
    return local.Groups.create(g)
  },
  async updateGroup(g) {
    local.Groups.update(g)
  },
  async listGroupsForUser(userId) {
    return local.Groups.forUser(userId)
  },
  async listMessages() {
    return local.Messages.all()
  },
  async addMessage(m) {
    local.Messages.add(m)
  },
  async listDmBetween(a, b) {
    return local.Messages.dmBetween(a, b)
  },
  async listForGroup(groupId) {
    return local.Messages.forGroup(groupId)
  },
  async getKeypair(userId) {
    return local.Keypairs.forUser(userId)
  },
  async upsertKeypair(rec) {
    local.Keypairs.upsert(rec)
  },
  async listGroupKeysForUser(userId) {
    return local.GroupKeys.forUser(userId)
  },
  async upsertGroupKey(env) {
    local.GroupKeys.upsert(env)
  },
  async newId(prefix) {
    return local.uid(prefix)
  },
}

/* ============================================================
   Supabase adapter (stub — fill in when ready)
   ============================================================
   Tables expected (see supabase/schema.sql):
     public.users(id text pk, data jsonb)
     public.groups(id text pk, data jsonb)
     public.messages(id text pk, data jsonb)
     public.keypairs(user_id text pk, data jsonb)
     public.group_keys(group_id text, user_id text, data jsonb, pk(group_id, user_id))
   RLS: deny select/insert/update/delete by default; per-user policies for
   reading & writing their own rows. Group membership for messages is
   enforced via a security-definer function if you want server-side checks.
   For the demo we trust the client. */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

function makeSupabaseDb(): Database {
  // We only import the SDK when configured so the bundle stays small
  // otherwise. Lazy-loaded on first call to keep cold-start fast.
  let _client: any = null
  async function client() {
    if (_client) return _client
    const { createClient } = await import('@supabase/supabase-js')
    _client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false },
    })
    return _client
  }

  const notImplemented = (op: string) => () => {
    throw new Error(
      `Supabase adapter: ${op} not yet implemented. ` +
        'See src/db.ts and supabase/schema.sql for the planned mapping.',
    )
  }
  // Once implemented, the shape is straightforward: each method = a
  // single .from(table).select / .insert / .update call, mapping rows
  // through their `data` JSONB column.
  return {
    getSession: notImplemented('getSession'),
    setSession: notImplemented('setSession'),
    clearSession: notImplemented('clearSession'),
    listUsers: notImplemented('listUsers'),
    getUser: notImplemented('getUser'),
    getUserByUsername: notImplemented('getUserByUsername'),
    createUser: notImplemented('createUser'),
    updateUser: notImplemented('updateUser'),
    isUsernameTaken: notImplemented('isUsernameTaken'),
    listGroups: notImplemented('listGroups'),
    getGroup: notImplemented('getGroup'),
    getGroupByCode: notImplemented('getGroupByCode'),
    createGroup: notImplemented('createGroup'),
    updateGroup: notImplemented('updateGroup'),
    listGroupsForUser: notImplemented('listGroupsForUser'),
    listMessages: notImplemented('listMessages'),
    addMessage: notImplemented('addMessage'),
    listDmBetween: notImplemented('listDmBetween'),
    listForGroup: notImplemented('listForGroup'),
    getKeypair: notImplemented('getKeypair'),
    upsertKeypair: notImplemented('upsertKeypair'),
    listGroupKeysForUser: notImplemented('listGroupKeysForUser'),
    upsertGroupKey: notImplemented('upsertGroupKey'),
    newId: async (prefix: string) => {
      // Reuse our local uid for client-side ids; server should accept any
      // string-shaped primary key.
      return local.uid(prefix)
    },
    // Suppress unused-var warning for the lazy client.
    _client: client,
    // Used in the unused-vars check below.
    __suppressUnused: undefined as any,
  } as unknown as Database & { _client: () => Promise<unknown> }
}

/* ============================================================
   Auto-select
   ============================================================ */

const selectedBackend: BackendName = supabaseConfigured ? 'supabase' : 'local'
// Suppress unused-symbol warnings for the Supabase stub.
if (!supabaseConfigured) {
  void makeSupabaseDb
}

export const db: Database = supabaseConfigured ? makeSupabaseDb() : localDb
export const backend: BackendName = selectedBackend

/* SQL to provision the Supabase schema (run once in Supabase SQL editor):
   include the file in supabase/schema.sql.
*/
export const SUPABASE_SCHEMA_HINT = `
-- supabase/schema.sql (paste into Supabase SQL editor)
create table if not exists public.users (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists public.groups (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists public.messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists public.keypairs (
  user_id text primary key,
  data jsonb not null
);
create table if not exists public.group_keys (
  group_id text not null,
  user_id text not null,
  data jsonb not null,
  primary key (group_id, user_id)
);
-- Disable RLS for the demo; production must add per-user / per-group policies.
alter table public.users disable row level security;
alter table public.groups disable row level security;
alter table public.messages disable row level security;
alter table public.keypairs disable row level security;
alter table public.group_keys disable row level security;
`.trim()
