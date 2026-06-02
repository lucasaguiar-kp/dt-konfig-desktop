import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BleCharacteristic, BleClient, BleDevice, BleDeviceDisconnected, BleNotification } from "./types";

export const tauriBleClient: BleClient = {
  startScan: () => invoke("ble_start_scan"),
  stopScan: () => invoke("ble_stop_scan"),
  connect: (deviceId) => invoke("ble_connect", { deviceId }),
  disconnect: (deviceId) => invoke("ble_disconnect", { deviceId }),
  services: (deviceId) => invoke<BleCharacteristic[]>("ble_services", { deviceId }),
  startNotify: (deviceId, serviceUuid, characteristicUuid) =>
    invoke("ble_start_notify", { deviceId, serviceUuid, characteristicUuid }),
  stopNotify: (deviceId, serviceUuid, characteristicUuid) =>
    invoke("ble_stop_notify", { deviceId, serviceUuid, characteristicUuid }),
  write: (deviceId, serviceUuid, characteristicUuid, value, maxByteSize) =>
    invoke("ble_write", { deviceId, serviceUuid, characteristicUuid, value, maxByteSize }),
  writeWithoutResponse: (deviceId, serviceUuid, characteristicUuid, value, maxByteSize) =>
    invoke("ble_write_without_response", { deviceId, serviceUuid, characteristicUuid, value, maxByteSize }),
  async onDeviceDiscovered(callback) {
    const unlisten = await listen<BleDevice>("ble://device-discovered", (event) => callback(event.payload));
    return unlisten;
  },
  async onNotification(callback) {
    const unlisten = await listen<BleNotification>("ble://notification", (event) => callback(event.payload));
    return unlisten;
  },
  async onDeviceDisconnected(callback) {
    const unlisten = await listen<BleDeviceDisconnected>("ble://device-disconnected", (event) => callback(event.payload));
    return unlisten;
  },
};
