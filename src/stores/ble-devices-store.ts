import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type { BleDevice } from "../lib/ble/types";
import { storage } from "../storage";

type DeviceWithTimestamp = {
  device: BleDevice;
  lastSeen: number;
  lastUpdate: number;
};

type BleDevicesStore = {
  devices: Map<string, DeviceWithTimestamp>;
  pinnedDeviceIds: string[];
  pinnedDeviceSnapshots: Record<string, BleDevice>;
  addOrUpdateDevice: (device: BleDevice) => void;
  removeStaleDevices: () => void;
  clearDevices: () => void;
  getDevicesList: () => BleDevice[];
  isDeviceOnline: (deviceId: string) => boolean;
  isPinned: (deviceId: string) => boolean;
  togglePinnedDevice: (deviceId: string) => void;
};

const STALE_TIMEOUT = 30_000;
const UPDATE_THROTTLE = 10_000;

const initialState = {
  devices: new Map<string, DeviceWithTimestamp>(),
  pinnedDeviceIds: [] as string[],
  pinnedDeviceSnapshots: {} as Record<string, BleDevice>,
};

function withSeenTimestamp(device: BleDevice, now: number): BleDevice {
  return {
    ...device,
    lastSeenAt: now,
  };
}

function isFresh(deviceData: DeviceWithTimestamp, now: number): boolean {
  return now - deviceData.lastSeen <= STALE_TIMEOUT;
}

export const useBleDevicesStore = create<BleDevicesStore>()(
  devtools(
    persist(
      (set, get) => ({
        devices: initialState.devices,
        pinnedDeviceIds: initialState.pinnedDeviceIds,
        pinnedDeviceSnapshots: initialState.pinnedDeviceSnapshots,

        addOrUpdateDevice: (device) => {
          const now = Date.now();
          const currentDevice = withSeenTimestamp(device, now);
          const existingDevice = get().devices.get(device.id);

          if (existingDevice && now - existingDevice.lastUpdate < UPDATE_THROTTLE) {
            existingDevice.lastSeen = now;
            existingDevice.device = currentDevice;

            if (get().pinnedDeviceIds.includes(device.id)) {
              set((state) => ({
                pinnedDeviceSnapshots: {
                  ...state.pinnedDeviceSnapshots,
                  [device.id]: currentDevice,
                },
              }));
            }

            return;
          }

          set((state) => {
            const devices = new Map(state.devices);
            devices.set(device.id, {
              device: currentDevice,
              lastSeen: now,
              lastUpdate: now,
            });

            if (!state.pinnedDeviceIds.includes(device.id)) {
              return { devices };
            }

            return {
              devices,
              pinnedDeviceSnapshots: {
                ...state.pinnedDeviceSnapshots,
                [device.id]: currentDevice,
              },
            };
          });
        },

        removeStaleDevices: () => {
          set((state) => {
            return { devices: new Map(state.devices) };
          });
        },

        clearDevices: () => {
          set((state) => {
            return { devices: new Map(state.devices) };
          });
        },

        getDevicesList: () => {
          const { devices, pinnedDeviceIds, pinnedDeviceSnapshots } = get();
          const visibleDevices = Array.from(devices.values()).map(({ device }) => device);

          for (const deviceId of pinnedDeviceIds) {
            if (devices.has(deviceId)) {
              continue;
            }

            const snapshot = pinnedDeviceSnapshots[deviceId];
            if (snapshot) {
              visibleDevices.push(snapshot);
            }
          }

          return visibleDevices;
        },

        isDeviceOnline: (deviceId) => {
          const deviceData = get().devices.get(deviceId);
          return deviceData ? isFresh(deviceData, Date.now()) : false;
        },

        isPinned: (deviceId) => get().pinnedDeviceIds.includes(deviceId),

        togglePinnedDevice: (deviceId) => {
          set((state) => {
            const isPinned = state.pinnedDeviceIds.includes(deviceId);
            const pinnedDeviceIds = isPinned
              ? state.pinnedDeviceIds.filter((id) => id !== deviceId)
              : [...state.pinnedDeviceIds, deviceId];
            const pinnedDeviceSnapshots = { ...state.pinnedDeviceSnapshots };

            if (isPinned) {
              delete pinnedDeviceSnapshots[deviceId];
            } else {
              const device = state.devices.get(deviceId)?.device;
              if (device) {
                pinnedDeviceSnapshots[deviceId] = device;
              }
            }

            return {
              pinnedDeviceIds,
              pinnedDeviceSnapshots,
            };
          });
        },
      }),
      {
        name: "ble-devices-store",
        storage: createJSONStorage(() => ({
          getItem: (name) => storage.show<string>(name),
          setItem: (name, value) => storage.store(value, name),
          removeItem: (name) => storage.destroy(name),
        })),
        partialize: (state) => ({
          pinnedDeviceIds: state.pinnedDeviceIds,
          pinnedDeviceSnapshots: state.pinnedDeviceSnapshots,
        }),
      },
    ),
  ),
);

export type { BleDevicesStore };
