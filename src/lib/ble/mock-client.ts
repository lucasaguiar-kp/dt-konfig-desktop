import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "./types";

export class MockBleClient implements BleClient {
  devices: BleDevice[] = [];
  characteristics: BleCharacteristic[] = [];
  writes: number[][] = [];
  private deviceCallbacks = new Set<(device: BleDevice) => void>();
  private notificationCallbacks = new Set<(notification: BleNotification) => void>();

  async startScan(): Promise<void> {}
  async stopScan(): Promise<void> {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async services(): Promise<BleCharacteristic[]> {
    return this.characteristics;
  }
  async startNotify(): Promise<void> {}
  async stopNotify(): Promise<void> {}
  async write(_deviceId: string, _serviceUuid: string, _characteristicUuid: string, value: number[]): Promise<void> {
    this.writes.push(value);
  }
  async writeWithoutResponse(
    _deviceId: string,
    _serviceUuid: string,
    _characteristicUuid: string,
    value: number[],
  ): Promise<void> {
    this.writes.push(value);
  }
  async onDeviceDiscovered(callback: (device: BleDevice) => void): Promise<() => void> {
    this.deviceCallbacks.add(callback);
    return () => this.deviceCallbacks.delete(callback);
  }
  async onNotification(callback: (notification: BleNotification) => void): Promise<() => void> {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }
  emitDevice(device: BleDevice): void {
    for (const callback of this.deviceCallbacks) callback(device);
  }
  emitNotification(notification: BleNotification): void {
    for (const callback of this.notificationCallbacks) callback(notification);
  }
}
