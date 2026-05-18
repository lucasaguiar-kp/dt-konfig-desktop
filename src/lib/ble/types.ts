export type BleDevice = {
  id: string;
  name: string | null;
  localName: string | null;
  rssi: number;
  lastSeenAt: number;
};

export type BleCharacteristic = {
  serviceUuid: string;
  characteristicUuid: string;
  properties: {
    notify: boolean;
    indicate: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
  };
};

export type BleNotification = {
  deviceId: string;
  serviceUuid: string;
  characteristicUuid: string;
  value: number[];
};

export type BleClient = {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  services(deviceId: string): Promise<BleCharacteristic[]>;
  startNotify(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void>;
  stopNotify(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void>;
  write(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    value: number[],
    maxByteSize?: number,
  ): Promise<void>;
  writeWithoutResponse(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    value: number[],
    maxByteSize?: number,
  ): Promise<void>;
  onDeviceDiscovered(callback: (device: BleDevice) => void): Promise<() => void>;
  onNotification(callback: (notification: BleNotification) => void): Promise<() => void>;
};
