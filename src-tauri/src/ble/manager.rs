use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use btleplug::{
    api::{
        Central, CentralEvent, CharPropFlags, Characteristic, Manager as _, Peripheral as _,
        PeripheralProperties, ScanFilter, ValueNotification, WriteType,
    },
    platform::{Adapter, Manager, Peripheral, PeripheralId},
};
use futures_util::StreamExt;
use tauri::{async_runtime, AppHandle, Emitter};
use tokio::time::sleep;
use tokio::sync::oneshot;
use uuid::Uuid;

use super::types::{
    BleCharacteristicPayload, BleCharacteristicPropertiesPayload, BleDevicePayload,
    BleNotificationPayload,
};

const DEVICE_DISCOVERED_EVENT: &str = "ble://device-discovered";
const NOTIFICATION_EVENT: &str = "ble://notification";

#[derive(Default)]
pub struct BleManagerState {
    inner: Arc<async_runtime::Mutex<BleManagerInner>>,
    notification_lifecycle: async_runtime::Mutex<()>,
    scan_lifecycle: async_runtime::Mutex<()>,
}

#[derive(Default)]
struct BleManagerInner {
    adapter: Option<Adapter>,
    next_notification_generation: u64,
    next_scan_generation: u64,
    scanning: bool,
    scan_task: Option<ScanSession>,
    notification_tasks: HashMap<NotificationKey, NotificationSession>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct NotificationKey {
    device_id: String,
    service_uuid: String,
    characteristic_uuid: String,
}

struct ScanSession {
    generation: u64,
    handle: async_runtime::JoinHandle<()>,
}

struct NotificationSession {
    generation: u64,
    handle: async_runtime::JoinHandle<()>,
}

impl BleManagerState {
    pub async fn start_scan(&self, app_handle: AppHandle) -> Result<(), String> {
        let _scan_lifecycle = self.scan_lifecycle.lock().await;
        let adapter = self.adapter().await?;
        let (gate_tx, gate_rx) = oneshot::channel();
        let (result_tx, result_rx) = oneshot::channel();

        {
            let mut inner = self.inner.lock().await;
            if inner.scan_task.is_some() {
                return Ok(());
            }

            inner.next_scan_generation += 1;
            let generation = inner.next_scan_generation;
            let task_inner = Arc::clone(&self.inner);
            let task_adapter = adapter.clone();
            let task = async_runtime::spawn(run_scan_session(
                task_inner,
                app_handle,
                task_adapter,
                generation,
                gate_rx,
                result_tx,
            ));

            inner.scanning = true;
            inner.scan_task = Some(ScanSession {
                generation,
                handle: task,
            });
        }

        let _ = gate_tx.send(());
        result_rx.await.unwrap_or(Ok(()))
    }

    pub async fn stop_scan(&self) -> Result<(), String> {
        let _scan_lifecycle = self.scan_lifecycle.lock().await;
        let (adapter, scan_task) = {
            let mut inner = self.inner.lock().await;
            inner.scanning = false;
            (inner.adapter.clone(), inner.scan_task.take())
        };

        if let Some(scan_task) = scan_task {
            scan_task.handle.abort();
        }

        if let Some(adapter) = adapter {
            adapter.stop_scan().await.map_err(format_ble_error)?;
        }

        Ok(())
    }

    pub async fn connect(&self, device_id: String) -> Result<(), String> {
        let adapter = self.adapter().await?;
        let should_refresh_cache = !self.inner.lock().await.scanning;
        let peripheral = peripheral_with_cache_refresh(&adapter, &device_id, should_refresh_cache).await?;

        if !peripheral.is_connected().await.map_err(format_ble_error)? {
            peripheral.connect().await.map_err(format_ble_error)?;
        }

        peripheral
            .discover_services()
            .await
            .map_err(format_ble_error)
    }

    pub async fn disconnect(&self, device_id: String) -> Result<(), String> {
        let _notification_lifecycle = self.notification_lifecycle.lock().await;
        let notification_tasks = {
            let mut inner = self.inner.lock().await;
            take_notification_tasks_for_device(&mut inner.notification_tasks, &device_id)
        };

        abort_tasks(notification_tasks);

        let peripheral = self.peripheral(&device_id).await?;

        if peripheral.is_connected().await.map_err(format_ble_error)? {
            peripheral.disconnect().await.map_err(format_ble_error)?;
        }

        Ok(())
    }

    pub async fn services(
        &self,
        device_id: String,
    ) -> Result<Vec<BleCharacteristicPayload>, String> {
        let peripheral = self.peripheral(&device_id).await?;

        if peripheral.is_connected().await.map_err(format_ble_error)? {
            peripheral
                .discover_services()
                .await
                .map_err(format_ble_error)?;
        }

        Ok(peripheral
            .characteristics()
            .into_iter()
            .map(characteristic_payload)
            .collect())
    }

    pub async fn start_notify(
        &self,
        app_handle: AppHandle,
        device_id: String,
        service_uuid: String,
        characteristic_uuid: String,
    ) -> Result<(), String> {
        let _notification_lifecycle = self.notification_lifecycle.lock().await;
        let key = NotificationKey::new(device_id.clone(), service_uuid, characteristic_uuid);
        let adapter = self.adapter().await?;
        let (gate_tx, gate_rx) = oneshot::channel();
        let (result_tx, result_rx) = oneshot::channel();

        {
            let mut inner = self.inner.lock().await;
            if inner.notification_tasks.contains_key(&key) {
                return Ok(());
            }

            inner.next_notification_generation += 1;
            let generation = inner.next_notification_generation;
            let task_inner = Arc::clone(&self.inner);
            let task_key = key.clone();
            let task_device_id = device_id.clone();
            let task = async_runtime::spawn(run_notification_session(
                task_inner,
                app_handle,
                adapter,
                task_key.clone(),
                task_device_id,
                generation,
                gate_rx,
                result_tx,
            ));

            if let Some(replaced_task) = inner.notification_tasks.insert(
                task_key,
                NotificationSession {
                    generation,
                    handle: task,
                },
            ) {
                replaced_task.handle.abort();
            }
        }

        let _ = gate_tx.send(());
        result_rx.await.unwrap_or(Ok(()))
    }

    pub async fn stop_notify(
        &self,
        device_id: String,
        service_uuid: String,
        characteristic_uuid: String,
    ) -> Result<(), String> {
        let _notification_lifecycle = self.notification_lifecycle.lock().await;
        let key = NotificationKey::new(device_id.clone(), service_uuid, characteristic_uuid);

        if let Some(notification_task) = self.inner.lock().await.notification_tasks.remove(&key) {
            notification_task.handle.abort();
        }

        let Ok(peripheral) = self.peripheral(&device_id).await else {
            return Ok(());
        };
        let Ok(characteristic) = self
            .characteristic(&peripheral, &key.service_uuid, &key.characteristic_uuid)
            .await
        else {
            return Ok(());
        };

        let _ = peripheral.unsubscribe(&characteristic).await;

        Ok(())
    }

    pub async fn write(
        &self,
        device_id: String,
        service_uuid: String,
        characteristic_uuid: String,
        value: Vec<u8>,
        max_byte_size: Option<usize>,
        with_response: bool,
    ) -> Result<(), String> {
        let peripheral = self.peripheral(&device_id).await?;
        let characteristic = self
            .characteristic(&peripheral, &service_uuid, &characteristic_uuid)
            .await?;
        let write_type = if with_response {
            WriteType::WithResponse
        } else {
            WriteType::WithoutResponse
        };

        for chunk in write_chunks(&value, max_byte_size)? {
            peripheral
                .write(&characteristic, &chunk, write_type)
                .await
                .map_err(format_ble_error)?;
        }

        Ok(())
    }

    async fn adapter(&self) -> Result<Adapter, String> {
        if let Some(adapter) = self.inner.lock().await.adapter.clone() {
            return Ok(adapter);
        }

        let manager = Manager::new().await.map_err(format_ble_error)?;
        let mut adapters = manager.adapters().await.map_err(format_ble_error)?;
        let adapter = adapters
            .drain(..)
            .next()
            .ok_or_else(|| "No Bluetooth adapter found".to_string())?;

        self.inner.lock().await.adapter = Some(adapter.clone());

        Ok(adapter)
    }

    async fn peripheral(&self, device_id: &str) -> Result<Peripheral, String> {
        let adapter = self.adapter().await?;
        peripheral(&adapter, device_id).await
    }

    async fn characteristic(
        &self,
        peripheral: &Peripheral,
        service_uuid: &str,
        characteristic_uuid: &str,
    ) -> Result<Characteristic, String> {
        characteristic(peripheral, service_uuid, characteristic_uuid).await
    }
}

impl NotificationKey {
    fn new(device_id: String, service_uuid: String, characteristic_uuid: String) -> Self {
        Self {
            device_id: normalize_device_id(&device_id),
            service_uuid: normalize_uuid_str(&service_uuid),
            characteristic_uuid: normalize_uuid_str(&characteristic_uuid),
        }
    }
}

async fn run_scan_session(
    inner: Arc<async_runtime::Mutex<BleManagerInner>>,
    app_handle: AppHandle,
    adapter: Adapter,
    generation: u64,
    gate_rx: oneshot::Receiver<()>,
    result_tx: oneshot::Sender<Result<(), String>>,
) {
    if gate_rx.await.is_err() {
        clear_scan_session(&inner, generation).await;
        return;
    }

    let mut result_tx = Some(result_tx);
    let mut events = match adapter.events().await {
        Ok(events) => events,
        Err(error) => {
            send_start_result(&mut result_tx, Err(format_ble_error(error)));
            clear_scan_session(&inner, generation).await;
            return;
        }
    };

    if let Err(error) = adapter.start_scan(ScanFilter::default()).await {
        send_start_result(&mut result_tx, Err(format_ble_error(error)));
        clear_scan_session(&inner, generation).await;
        return;
    }

    send_start_result(&mut result_tx, Ok(()));
    emit_known_peripherals(&app_handle, &adapter).await;

    while let Some(event) = events.next().await {
        if let Some(peripheral_id) = event_peripheral_id(&event) {
            emit_peripheral(&app_handle, &adapter, &peripheral_id).await;
        }
    }

    let _ = adapter.stop_scan().await;
    clear_scan_session(&inner, generation).await;
}

async fn run_notification_session(
    inner: Arc<async_runtime::Mutex<BleManagerInner>>,
    app_handle: AppHandle,
    adapter: Adapter,
    key: NotificationKey,
    device_id: String,
    generation: u64,
    gate_rx: oneshot::Receiver<()>,
    result_tx: oneshot::Sender<Result<(), String>>,
) {
    if gate_rx.await.is_err() {
        clear_notification_session(&inner, &key, generation).await;
        return;
    }

    let mut result_tx = Some(result_tx);
    let peripheral = match peripheral(&adapter, &device_id).await {
        Ok(peripheral) => peripheral,
        Err(error) => {
            send_start_result(&mut result_tx, Err(error));
            clear_notification_session(&inner, &key, generation).await;
            return;
        }
    };
    let characteristic =
        match characteristic(&peripheral, &key.service_uuid, &key.characteristic_uuid).await {
            Ok(characteristic) => characteristic,
            Err(error) => {
                send_start_result(&mut result_tx, Err(error));
                clear_notification_session(&inner, &key, generation).await;
                return;
            }
        };
    let mut notifications = match peripheral.notifications().await {
        Ok(notifications) => notifications,
        Err(error) => {
            send_start_result(&mut result_tx, Err(format_ble_error(error)));
            clear_notification_session(&inner, &key, generation).await;
            return;
        }
    };

    if let Err(error) = peripheral.subscribe(&characteristic).await {
        send_start_result(&mut result_tx, Err(format_ble_error(error)));
        clear_notification_session(&inner, &key, generation).await;
        return;
    }

    send_start_result(&mut result_tx, Ok(()));

    while let Some(notification) = notifications.next().await {
        if normalize_uuid(notification.service_uuid) != key.service_uuid
            || normalize_uuid(notification.uuid) != key.characteristic_uuid
        {
            continue;
        }

        let payload = notification_payload(&device_id, notification);
        let _ = app_handle.emit(NOTIFICATION_EVENT, payload);
    }

    let _ = peripheral.unsubscribe(&characteristic).await;
    clear_notification_session(&inner, &key, generation).await;
}

fn send_start_result(
    result_tx: &mut Option<oneshot::Sender<Result<(), String>>>,
    result: Result<(), String>,
) {
    if let Some(result_tx) = result_tx.take() {
        let _ = result_tx.send(result);
    }
}

async fn clear_scan_session(inner: &Arc<async_runtime::Mutex<BleManagerInner>>, generation: u64) {
    let mut inner = inner.lock().await;
    if inner
        .scan_task
        .as_ref()
        .is_some_and(|session| session.generation == generation)
    {
        inner.scan_task = None;
        inner.scanning = false;
    }
}

async fn clear_notification_session(
    inner: &Arc<async_runtime::Mutex<BleManagerInner>>,
    key: &NotificationKey,
    generation: u64,
) {
    let mut inner = inner.lock().await;
    if inner
        .notification_tasks
        .get(key)
        .is_some_and(|session| session.generation == generation)
    {
        inner.notification_tasks.remove(key);
    }
}

async fn peripheral(adapter: &Adapter, device_id: &str) -> Result<Peripheral, String> {
    find_peripheral(adapter, device_id)
        .await?
        .ok_or_else(|| format!("BLE device not found: {device_id}"))
}

async fn peripheral_with_cache_refresh(
    adapter: &Adapter,
    device_id: &str,
    should_refresh_cache: bool,
) -> Result<Peripheral, String> {
    if let Some(peripheral) = find_peripheral(adapter, device_id).await? {
        return Ok(peripheral);
    }

    if should_refresh_cache {
        let _ = adapter.start_scan(ScanFilter::default()).await;
        sleep(Duration::from_millis(1_500)).await;
        let peripheral = find_peripheral(adapter, device_id).await?;
        let _ = adapter.stop_scan().await;

        if let Some(peripheral) = peripheral {
            return Ok(peripheral);
        }
    }

    Err(format!("BLE device not found: {device_id}"))
}

async fn find_peripheral(adapter: &Adapter, device_id: &str) -> Result<Option<Peripheral>, String> {
    let peripherals = adapter.peripherals().await.map_err(format_ble_error)?;

    Ok(peripherals
        .into_iter()
        .find(|peripheral| ids_match(&peripheral.id().to_string(), device_id))
    )
}

async fn characteristic(
    peripheral: &Peripheral,
    service_uuid: &str,
    characteristic_uuid: &str,
) -> Result<Characteristic, String> {
    let service_uuid = normalize_uuid_str(service_uuid);
    let characteristic_uuid = normalize_uuid_str(characteristic_uuid);

    if peripheral.characteristics().is_empty()
        && peripheral.is_connected().await.map_err(format_ble_error)?
    {
        peripheral
            .discover_services()
            .await
            .map_err(format_ble_error)?;
    }

    peripheral
        .characteristics()
        .into_iter()
        .find(|characteristic| {
            normalize_uuid(characteristic.service_uuid) == service_uuid
                && normalize_uuid(characteristic.uuid) == characteristic_uuid
        })
        .ok_or_else(|| {
            format!(
                "BLE characteristic not found: service={service_uuid} characteristic={characteristic_uuid}"
            )
        })
}

fn event_peripheral_id(event: &CentralEvent) -> Option<PeripheralId> {
    match event {
        CentralEvent::DeviceDiscovered(id)
        | CentralEvent::DeviceUpdated(id)
        | CentralEvent::DeviceConnected(id)
        | CentralEvent::DeviceDisconnected(id)
        | CentralEvent::DeviceServicesModified(id) => Some(id.clone()),
        CentralEvent::ManufacturerDataAdvertisement { id, .. }
        | CentralEvent::ServiceDataAdvertisement { id, .. }
        | CentralEvent::ServicesAdvertisement { id, .. }
        | CentralEvent::RssiUpdate { id, .. } => Some(id.clone()),
        CentralEvent::StateUpdate(_) => None,
    }
}

async fn emit_known_peripherals(app_handle: &AppHandle, adapter: &Adapter) {
    let Ok(peripherals) = adapter.peripherals().await else {
        return;
    };

    for peripheral in peripherals {
        emit_peripheral_with_properties(app_handle, &peripheral).await;
    }
}

async fn emit_peripheral(app_handle: &AppHandle, adapter: &Adapter, peripheral_id: &PeripheralId) {
    if let Ok(peripheral) = adapter.peripheral(peripheral_id).await {
        emit_peripheral_with_properties(app_handle, &peripheral).await;
    }
}

async fn emit_peripheral_with_properties(app_handle: &AppHandle, peripheral: &Peripheral) {
    let Ok(Some(properties)) = peripheral.properties().await else {
        return;
    };

    let payload = device_payload(peripheral, properties);
    let _ = app_handle.emit(DEVICE_DISCOVERED_EVENT, payload);
}

fn device_payload(peripheral: &Peripheral, properties: PeripheralProperties) -> BleDevicePayload {
    let local_name = properties.local_name;
    let name = properties.advertisement_name.or_else(|| local_name.clone());

    BleDevicePayload {
        id: peripheral.id().to_string(),
        name,
        local_name,
        rssi: properties.rssi.unwrap_or_default(),
        last_seen_at: now_millis(),
    }
}

fn characteristic_payload(characteristic: Characteristic) -> BleCharacteristicPayload {
    let properties = characteristic.properties;

    BleCharacteristicPayload {
        service_uuid: normalize_uuid(characteristic.service_uuid),
        characteristic_uuid: normalize_uuid(characteristic.uuid),
        properties: BleCharacteristicPropertiesPayload {
            notify: properties.contains(CharPropFlags::NOTIFY),
            indicate: properties.contains(CharPropFlags::INDICATE),
            write: properties.contains(CharPropFlags::WRITE),
            write_without_response: properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE),
        },
    }
}

fn write_chunks(value: &[u8], max_byte_size: Option<usize>) -> Result<Vec<Vec<u8>>, String> {
    let Some(max_byte_size) = max_byte_size else {
        return Ok(vec![value.to_vec()]);
    };

    if max_byte_size == 0 {
        return Err("maxByteSize must be greater than 0".to_string());
    }

    if value.is_empty() {
        return Ok(vec![Vec::new()]);
    }

    Ok(value
        .chunks(max_byte_size)
        .map(|chunk| chunk.to_vec())
        .collect())
}

fn notification_keys_for_device<T>(
    notification_tasks: &HashMap<NotificationKey, T>,
    device_id: &str,
) -> Vec<NotificationKey> {
    let normalized_device_id = normalize_device_id(device_id);

    notification_tasks
        .keys()
        .filter(|key| key.device_id == normalized_device_id)
        .cloned()
        .collect()
}

fn take_notification_tasks_for_device(
    notification_tasks: &mut HashMap<NotificationKey, NotificationSession>,
    device_id: &str,
) -> Vec<async_runtime::JoinHandle<()>> {
    notification_keys_for_device(notification_tasks, device_id)
        .into_iter()
        .filter_map(|key| {
            notification_tasks
                .remove(&key)
                .map(|session| session.handle)
        })
        .collect()
}

fn abort_tasks(tasks: Vec<async_runtime::JoinHandle<()>>) {
    for task in tasks {
        task.abort();
    }
}

fn normalize_uuid(uuid: Uuid) -> String {
    normalize_uuid_alias(&uuid.to_string())
}

fn normalize_uuid_str(uuid: &str) -> String {
    normalize_uuid_alias(uuid)
}

fn normalize_uuid_alias(uuid: &str) -> String {
    let normalized = uuid.to_lowercase();
    normalized
        .strip_prefix("0000")
        .and_then(|value| value.strip_suffix("-0000-1000-8000-00805f9b34fb"))
        .filter(|value| value.len() == 4 && value.chars().all(|character| character.is_ascii_hexdigit()))
        .map(str::to_string)
        .unwrap_or(normalized)
}

fn normalize_device_id(device_id: &str) -> String {
    device_id.to_lowercase()
}

fn notification_payload(
    device_id: &str,
    notification: ValueNotification,
) -> BleNotificationPayload {
    BleNotificationPayload {
        device_id: device_id.to_string(),
        service_uuid: normalize_uuid(notification.service_uuid),
        characteristic_uuid: normalize_uuid(notification.uuid),
        value: notification.value,
    }
}

fn ids_match(lhs: &str, rhs: &str) -> bool {
    lhs == rhs || lhs.eq_ignore_ascii_case(rhs)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default()
}

fn format_ble_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use btleplug::api::ValueNotification;
    use uuid::Uuid;

    use super::{
        normalize_uuid_str, notification_keys_for_device, notification_payload, write_chunks,
        NotificationKey,
    };

    #[test]
    fn write_chunks_splits_payload_when_max_byte_size_is_valid() {
        let chunks = write_chunks(&[1, 2, 3, 4, 5], Some(2)).expect("chunks should be valid");

        assert_eq!(chunks, vec![vec![1, 2], vec![3, 4], vec![5]]);
    }

    #[test]
    fn write_chunks_uses_single_chunk_when_max_byte_size_is_absent() {
        assert_eq!(
            write_chunks(&[1, 2, 3], None).expect("chunks should be valid"),
            vec![vec![1, 2, 3]]
        );
    }

    #[test]
    fn write_chunks_rejects_zero_max_byte_size() {
        assert_eq!(
            write_chunks(&[1, 2, 3], Some(0)),
            Err("maxByteSize must be greater than 0".to_string())
        );
    }

    #[test]
    fn notification_key_normalizes_device_and_uuid_fields() {
        let key = NotificationKey::new(
            "ABCDEF".to_string(),
            "0000ABCD-0000-1000-8000-00805F9B34FB".to_string(),
            "0000DCBA-0000-1000-8000-00805F9B34FB".to_string(),
        );

        assert_eq!(key.device_id, "abcdef");
        assert_eq!(key.service_uuid, "abcd");
        assert_eq!(key.characteristic_uuid, "dcba");
    }

    #[test]
    fn normalize_uuid_str_shortens_standard_ble_uuid_aliases() {
        assert_eq!(
            normalize_uuid_str("0000FFE0-0000-1000-8000-00805F9B34FB"),
            "ffe0"
        );
    }

    #[test]
    fn notification_keys_for_device_selects_only_matching_device() {
        let first_key = NotificationKey::new(
            "DEVICE-1".to_string(),
            "service-a".to_string(),
            "char-a".to_string(),
        );
        let second_key = NotificationKey::new(
            "device-2".to_string(),
            "service-b".to_string(),
            "char-b".to_string(),
        );
        let mut tasks = HashMap::new();
        tasks.insert(first_key.clone(), ());
        tasks.insert(second_key, ());

        assert_eq!(
            notification_keys_for_device(&tasks, "device-1"),
            vec![first_key]
        );
    }

    #[test]
    fn notification_payload_preserves_original_device_id() {
        let service_uuid = Uuid::parse_str("0000ABCD-0000-1000-8000-00805F9B34FB").unwrap();
        let characteristic_uuid = Uuid::parse_str("0000DCBA-0000-1000-8000-00805F9B34FB").unwrap();
        let payload = notification_payload(
            "UPPERCASE-ID",
            ValueNotification {
                uuid: characteristic_uuid,
                service_uuid,
                value: vec![1, 2, 3],
            },
        );

        assert_eq!(payload.device_id, "UPPERCASE-ID");
        assert_eq!(payload.service_uuid, "abcd");
        assert_eq!(payload.characteristic_uuid, "dcba");
        assert_eq!(payload.value, vec![1, 2, 3]);
    }
}
