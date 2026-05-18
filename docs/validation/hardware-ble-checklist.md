# Hardware BLE Validation Checklist

## Test Notes

- OS:
- App version:
- Device:
- Result:

## Scanner

- [ ] macOS discovers DTN NB device named with `86` prefix.
- [ ] macOS discovers DTL LoRa device named with `a84` prefix.
- [ ] Windows discovers DTN NB device named with `86` prefix.
- [ ] Windows discovers DTL LoRa device named with `a84` prefix.
- [ ] Linux discovers DTN NB device named with `86` prefix after BlueZ setup.
- [ ] Linux discovers DTL LoRa device named with `a84` prefix after BlueZ setup.

## Terminal

- [ ] Connect to DTN NB.
- [ ] Send `AT+CFG`.
- [ ] Receive parsed `OK` response.
- [ ] Copy terminal output.
- [ ] Disconnect and reconnect.

## OTA

- [ ] Select valid `.bin`.
- [ ] Enter IMEI and OTA password.
- [ ] Device is found during OTA scan.
- [ ] Sync handshake succeeds.
- [ ] Erase succeeds.
- [ ] Flash progress reaches 100%.
- [ ] Device reboots.
