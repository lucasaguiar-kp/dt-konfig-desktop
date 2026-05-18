use tauri::State;

use super::{
    manager::BleManagerState,
    types::{BleCharacteristicPayload, WriteRequest},
};

#[tauri::command]
pub async fn ble_start_scan(state: State<'_, BleManagerState>) -> Result<(), String> {
    state.start_scan().await
}

#[tauri::command]
pub async fn ble_stop_scan(state: State<'_, BleManagerState>) -> Result<(), String> {
    state.stop_scan().await
}

#[tauri::command]
pub async fn ble_connect(
    state: State<'_, BleManagerState>,
    device_id: String,
) -> Result<(), String> {
    state.connect(device_id).await
}

#[tauri::command]
pub async fn ble_disconnect(
    state: State<'_, BleManagerState>,
    device_id: String,
) -> Result<(), String> {
    state.disconnect(device_id).await
}

#[tauri::command]
pub async fn ble_services(
    state: State<'_, BleManagerState>,
    device_id: String,
) -> Result<Vec<BleCharacteristicPayload>, String> {
    state.services(device_id).await
}

#[tauri::command]
pub async fn ble_start_notify(
    state: State<'_, BleManagerState>,
    device_id: String,
    service_uuid: String,
    characteristic_uuid: String,
) -> Result<(), String> {
    state
        .start_notify(device_id, service_uuid, characteristic_uuid)
        .await
}

#[tauri::command]
pub async fn ble_stop_notify(
    state: State<'_, BleManagerState>,
    device_id: String,
    service_uuid: String,
    characteristic_uuid: String,
) -> Result<(), String> {
    state
        .stop_notify(device_id, service_uuid, characteristic_uuid)
        .await
}

#[tauri::command]
pub async fn ble_write(
    state: State<'_, BleManagerState>,
    device_id: String,
    service_uuid: String,
    characteristic_uuid: String,
    value: Vec<u8>,
    max_byte_size: Option<usize>,
) -> Result<(), String> {
    write(
        state,
        WriteRequest {
            device_id,
            service_uuid,
            characteristic_uuid,
            value,
            max_byte_size,
        },
        true,
    )
    .await
}

#[tauri::command]
pub async fn ble_write_without_response(
    state: State<'_, BleManagerState>,
    device_id: String,
    service_uuid: String,
    characteristic_uuid: String,
    value: Vec<u8>,
    max_byte_size: Option<usize>,
) -> Result<(), String> {
    write(
        state,
        WriteRequest {
            device_id,
            service_uuid,
            characteristic_uuid,
            value,
            max_byte_size,
        },
        false,
    )
    .await
}

async fn write(
    state: State<'_, BleManagerState>,
    request: WriteRequest,
    with_response: bool,
) -> Result<(), String> {
    if let Some(max_byte_size) = request.max_byte_size {
        if request.value.len() > max_byte_size {
            return Err(format!(
                "BLE write payload exceeds maxByteSize of {max_byte_size} bytes"
            ));
        }
    }

    state
        .write(
            request.device_id,
            request.service_uuid,
            request.characteristic_uuid,
            request.value,
            with_response,
        )
        .await
}
