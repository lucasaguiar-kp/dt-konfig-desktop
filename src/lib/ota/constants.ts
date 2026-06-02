export const PKT_START = 0xfe;
export const PKT_END = 0xef;

export const CMD_SYNC = 0x01;
export const CMD_FLASH = 0x03;
export const CMD_ERASE = 0x04;
export const CMD_REBOOT = 0x0c;
export const CMD_GET_VERSION = 0x13;

export const LORA_FREQ = 838_000_000;
export const DEV_EUI = "6666666666666666";
export const LORA_SF = 5;
export const LORA_BW = 2;
export const LORA_TX_POWER = 10;

export const FLASH_BASE_ADDR = 0x08_00_78_00;
export const FALLBACK_FLASH_CHUNK_SIZE = 96;
export const STABLE_FLASH_CHUNK_SIZE = 384;
export const OPTIMIZED_FLASH_CHUNK_SIZE = 480;
export const FLASH_CHUNK_SIZE_CANDIDATES = [
  OPTIMIZED_FLASH_CHUNK_SIZE,
  STABLE_FLASH_CHUNK_SIZE,
  192,
  FALLBACK_FLASH_CHUNK_SIZE,
] as const;
export const CHUNK_SIZE = FLASH_CHUNK_SIZE_CANDIDATES[0];

export const MAX_FILE_SIZE = 192 * 1024;
export const MAGIC_STRING = "dragino_6601_ota";

export const DEFAULT_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const DEFAULT_NOTIFY_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
export const DEFAULT_WRITE_CHAR_UUID = DEFAULT_NOTIFY_CHAR_UUID;

export const DEFAULT_UUID = "6666666666666666";

export const IMEI_SEARCH_TIMEOUT_MS = 90_000;
export const DEFAULT_MAX_WRITE_BYTES = 20;
// The proven mobile app bumps the BLE MTU to 512 right after connecting, so an OTA AT command
// goes out in a single write (~509B). Without that, the 75B SYNC command is split into 4x20B
// fragments and the device's BLE->UART bridge forwards each fragment as a separate UART burst,
// which its line-based AT parser reassembles unreliably -> intermittent "Password Incorrect".
// macOS/CoreBluetooth negotiates a large MTU automatically, so we just need to stop fragmenting
// at 20B. 180B keeps every control command in one write and stays within a safe write-without-
// response payload for the smallest MTU we expect; the flash step shrinks blocks on its own.
export const OTA_MAX_WRITE_BYTES = 180;
export const SYNC_TIMEOUT_MS = 3500;
export const CMD_TIMEOUT_MS = 5000;
export const FLASH_PROBE_TIMEOUT_MS = 2500;
export const BLE_WRITE_TIMEOUT_MS = 5000;
// Reference host script (stm32_NB_OTA...py) alternates factory/password UUID and
// retries ~11 times before giving up, treating "Password Incorrect" as a retry, not a
// fatal error. 12 attempts gives 6 tries with the real password + 6 with the factory EUI.
export const SYNC_MAX_RETRIES = 12;
// How many attempts in a row may get NO response at all before we conclude the device
// is silent (out of range / not in upgrade mode) and stop early instead of waiting out
// every retry. Password rejections do not count toward this.
export const SYNC_MAX_SILENT_ATTEMPTS = 4;
export const CMD_MAX_RETRIES = 2;

export const PASSWORD_ERROR_PATTERNS = ["PASSWORD ERROR", "PASSWORD INCORRECT"];
export const SYNC_SUCCESS_PATTERNS = ["UPLOAD START:"];
