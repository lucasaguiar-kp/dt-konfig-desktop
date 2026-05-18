import type { BleCharacteristic, BleClient, BleNotification } from "../ble/types";
import { bytesToPrintableAscii, normalizeBleUuid } from "./protocol";
import type { TerminalCharacteristic } from "./types";

const DEVICE_TERMINAL_SERVICE_UUID = "ffe0";

function canNotify(characteristic: BleCharacteristic): boolean {
  return characteristic.properties.notify || characteristic.properties.indicate;
}

function canWrite(characteristic: BleCharacteristic): boolean {
  return characteristic.properties.write || characteristic.properties.writeWithoutResponse;
}

export function resolveDeviceTerminalCharacteristic(
  characteristics: BleCharacteristic[],
): TerminalCharacteristic | null {
  const candidates = characteristics
    .map((characteristic) => ({
      ...characteristic,
      serviceUuid: normalizeBleUuid(characteristic.serviceUuid),
      characteristicUuid: normalizeBleUuid(characteristic.characteristicUuid),
    }))
    .filter((characteristic) => characteristic.serviceUuid === DEVICE_TERMINAL_SERVICE_UUID);

  const writeNotify = candidates.find((characteristic) => canWrite(characteristic) && canNotify(characteristic));
  const notifyOnly = candidates.find(canNotify);
  const writeOnly = candidates.find(canWrite) ?? writeNotify;

  if (!(writeOnly && notifyOnly)) {
    return null;
  }

  return {
    serviceUuid: DEVICE_TERMINAL_SERVICE_UUID,
    writeCharUuid: writeNotify?.characteristicUuid ?? writeOnly.characteristicUuid,
    notifyCharUuid: notifyOnly.characteristicUuid,
  };
}

function notificationToAscii(notification: BleNotification): string | null {
  if (notification.value.length === 0) {
    return null;
  }

  return bytesToPrintableAscii(notification.value);
}

export async function subscribeToDeviceTerminal(
  bleClient: BleClient,
  deviceId: string,
  onMessage: (ascii: string) => void,
): Promise<{ remove: () => void }> {
  const characteristics = await bleClient.services(deviceId);
  const terminalCharacteristic = resolveDeviceTerminalCharacteristic(characteristics);

  if (!terminalCharacteristic) {
    throw new Error("Device terminal characteristic was not found.");
  }

  const unlisten = await bleClient.onNotification((notification) => {
    if (String(notification.deviceId) !== String(deviceId)) {
      return;
    }

    const serviceUuid = normalizeBleUuid(notification.serviceUuid);
    const characteristicUuid = normalizeBleUuid(notification.characteristicUuid);
    if (
      serviceUuid !== terminalCharacteristic.serviceUuid ||
      characteristicUuid !== terminalCharacteristic.notifyCharUuid
    ) {
      return;
    }

    const ascii = notificationToAscii(notification);
    if (ascii) {
      onMessage(ascii);
    }
  });

  try {
    await bleClient.startNotify(deviceId, terminalCharacteristic.serviceUuid, terminalCharacteristic.notifyCharUuid);
  } catch (error) {
    unlisten();
    throw error;
  }

  return {
    remove: () => {
      unlisten();
      void bleClient.stopNotify(
        deviceId,
        terminalCharacteristic.serviceUuid,
        terminalCharacteristic.notifyCharUuid,
      );
    },
  };
}
