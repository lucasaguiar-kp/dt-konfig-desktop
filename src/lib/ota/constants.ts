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
export const CHUNK_SIZE = 96;

export const MAX_FILE_SIZE = 192 * 1024;
export const MAGIC_STRING = "dragino_6601_ota";

export const DEFAULT_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const DEFAULT_NOTIFY_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
export const DEFAULT_WRITE_CHAR_UUID = DEFAULT_NOTIFY_CHAR_UUID;

export const DEFAULT_UUID = "6666666666666666";

export const IMEI_SEARCH_TIMEOUT_MS = 90_000;
export const DEFAULT_MAX_WRITE_BYTES = 20;
export const SYNC_TIMEOUT_MS = 3500;
export const CMD_TIMEOUT_MS = 5000;
export const SYNC_MAX_RETRIES = 6;
export const CMD_MAX_RETRIES = 2;

export const PASSWORD_ERROR_PATTERNS = ["PASSWORD ERROR", "PASSWORD INCORRECT"];
export const SYNC_SUCCESS_PATTERNS = ["UPLOAD START:"];
