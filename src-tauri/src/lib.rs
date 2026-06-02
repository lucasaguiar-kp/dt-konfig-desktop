mod ble;

use ble::manager::BleManagerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BleManagerState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            ble::commands::ble_start_scan,
            ble::commands::ble_stop_scan,
            ble::commands::ble_connect,
            ble::commands::ble_disconnect,
            ble::commands::ble_services,
            ble::commands::ble_start_notify,
            ble::commands::ble_stop_notify,
            ble::commands::ble_write,
            ble::commands::ble_write_without_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
