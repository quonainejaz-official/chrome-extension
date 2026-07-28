export * from './storage';
export * from './limits';
export * from './providers';
export * from './sensitivity';
export * from './prompt';
export * from './defaults';

/** Message type sent by the keyboard command handler. */
export const COMMANDS = {
  toggleEnabled: 'toggle-enabled',
  togglePause: 'toggle-pause',
  rescan: 'rescan',
} as const;

/** Context menu item ids. */
export const CONTEXT_MENU_IDS = {
  toggleEnabled: 'unslop-toggle-enabled',
  togglePause: 'unslop-toggle-pause',
  rescan: 'unslop-rescan',
  openOptions: 'unslop-open-options',
} as const;

/** Data attribute used to mark posts the content script has already handled. */
export const PROCESSED_ATTR = 'data-unslop-state';
export const POST_ID_ATTR = 'data-unslop-id';
