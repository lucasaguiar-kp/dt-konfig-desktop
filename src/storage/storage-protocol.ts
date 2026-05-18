export type StorageProtocol = {
  store<T>(value: T, key: string): Promise<void>;
  show<T>(key: string): Promise<T | null>;
  destroy(key: string): Promise<void>;
};
