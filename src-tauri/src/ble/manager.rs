use super::types::BleCharacteristicPayload;

#[derive(Default)]
pub struct BleManagerState;

impl BleManagerState {
    pub async fn start_scan(&self) -> Result<(), String> {
        Err("BLE scan backend not implemented yet".to_string())
    }

    pub async fn stop_scan(&self) -> Result<(), String> {
        Ok(())
    }

    pub async fn connect(&self, _device_id: String) -> Result<(), String> {
        Err("BLE connect backend not implemented yet".to_string())
    }

    pub async fn disconnect(&self, _device_id: String) -> Result<(), String> {
        Ok(())
    }

    pub async fn services(
        &self,
        _device_id: String,
    ) -> Result<Vec<BleCharacteristicPayload>, String> {
        Err("BLE service discovery backend not implemented yet".to_string())
    }

    pub async fn start_notify(
        &self,
        _device_id: String,
        _service_uuid: String,
        _characteristic_uuid: String,
    ) -> Result<(), String> {
        Err("BLE notification backend not implemented yet".to_string())
    }

    pub async fn stop_notify(
        &self,
        _device_id: String,
        _service_uuid: String,
        _characteristic_uuid: String,
    ) -> Result<(), String> {
        Ok(())
    }

    pub async fn write(
        &self,
        _device_id: String,
        _service_uuid: String,
        _characteristic_uuid: String,
        _value: Vec<u8>,
        _with_response: bool,
    ) -> Result<(), String> {
        Err("BLE write backend not implemented yet".to_string())
    }
}
