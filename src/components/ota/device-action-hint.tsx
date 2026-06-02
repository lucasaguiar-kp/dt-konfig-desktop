type DeviceActionHintProps = {
  variant: "red-blink" | "green-hold";
};

export function DeviceActionHint({ variant }: DeviceActionHintProps) {
  return (
    <div className={`device-hint device-hint-${variant}`} aria-hidden="true">
      <div className="device-hint-body">
        <span className="device-hint-led" />
        <span className="device-hint-button">
          <span className="device-hint-button-ring" />
        </span>
      </div>
    </div>
  );
}
