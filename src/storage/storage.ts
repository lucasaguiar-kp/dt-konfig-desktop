import type { StorageProtocol } from "./storage-protocol";

export class Storage implements StorageProtocol {
  readonly defaultKey = "@khomp_dt-konfig_desktop_storage";

  async store<T>(value: T, key: string): Promise<void> {
    localStorage.setItem(`${this.defaultKey}:${key}`, JSON.stringify(value));
  }

  async show<T>(key: string): Promise<T | null> {
    const jsonValue = localStorage.getItem(`${this.defaultKey}:${key}`);
    return jsonValue === null ? null : (JSON.parse(jsonValue) as T);
  }

  async destroy(key: string): Promise<void> {
    localStorage.removeItem(`${this.defaultKey}:${key}`);
  }
}
