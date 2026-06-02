use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct BleDevicePayload {
    pub id: String,
    pub name: Option<String>,
    pub local_name: Option<String>,
    pub rssi: i16,
    pub last_seen_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleCharacteristicPayload {
    pub service_uuid: String,
    pub characteristic_uuid: String,
    pub properties: BleCharacteristicPropertiesPayload,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleCharacteristicPropertiesPayload {
    pub notify: bool,
    pub indicate: bool,
    pub write: bool,
    pub write_without_response: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct BleNotificationPayload {
    pub device_id: String,
    pub service_uuid: String,
    pub characteristic_uuid: String,
    pub value: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleDeviceDisconnectedPayload {
    pub device_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
    pub device_id: String,
    pub service_uuid: String,
    pub characteristic_uuid: String,
    pub value: Vec<u8>,
    pub max_byte_size: Option<usize>,
}
