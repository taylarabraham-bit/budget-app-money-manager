// Offline-first sync with the household's Supabase. Wire-up: mount
// <SyncProvider> inside every data provider (it reads them all), and put
// <SyncCard /> (features/settings) where the server details are entered.
export { SyncProvider, useSync } from './SyncProvider';
// SupabaseTransport is loaded on demand (see SyncProvider.defaultTransport) so supabase-js stays out of the main bundle.
export { MemoryTransport } from './transport-memory';
export { SYNC_STORAGE_KEY, loadSyncState } from './state';
export type { SyncState } from './state';
export { COLLECTIONS, isServerUrl } from './types';
export type { CollectionKey, SyncConfig, SyncRecord, SyncStatus, SyncTransport, ServerHousehold, PullResult, Row } from './types';
