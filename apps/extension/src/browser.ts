/**
 * The few extension APIs used, typed by hand (no `@types/chrome`). Firefox's `browser` and
 * Chrome's `chrome` both return promises in Manifest V3; Firefox's is preferred where present.
 */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface Tab {
  id?: number;
  url?: string;
}

interface Sender {
  tab?: Tab;
  url?: string;
}

export interface Ext {
  storage: {
    sync: StorageArea;
    local: StorageArea;
    onChanged: {
      addListener(fn: (changes: Record<string, StorageChange>, area: string) => void): void;
    };
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        fn: (
          message: unknown,
          sender: Sender,
          respond: (reply: unknown) => void,
        ) => boolean | undefined,
      ): void;
    };
    onInstalled: { addListener(fn: (details: { reason: string }) => void): void };
    openOptionsPage(): Promise<void>;
    getURL(path: string): string;
  };
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<Tab[]>;
    create(props: { url: string }): Promise<Tab>;
  };
}

const scope = globalThis as unknown as { browser?: Ext; chrome?: Ext };
export const ext: Ext = (scope.browser ?? scope.chrome) as Ext;
