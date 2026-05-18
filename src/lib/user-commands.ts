export type UserCommand = {
  id: string;
  command: string;
  description?: string;
  requiresValue: boolean;
};

type DefaultCommandDefinition = {
  command: string;
  description?: string;
  requiresValue?: boolean;
};

export const DEFAULT_USER_COMMANDS: DefaultCommandDefinition[] = [
  { command: "AT+CFG", description: "Printa as configurações do dispositivo" },
  { command: "AT+TDC=", description: "Altera o intervalo de uplink" },
  { command: "AT+APN=", description: "Configura a APN do Chip" },
  {
    command: "AT+QCGDEFCONT=IPV4V6,",
    description: "Configura o protocolo IP",
    requiresValue: true,
  },
  {
    command: "AT+QBAND=",
    description: "Configura a Banda NB que o dispositivo deve se conectar",
  },
  {
    command: "AT+PRO=",
    description: "Configura o protocolo de envio e formatação do Payload",
  },
  { command: "AT+SERVADDR=", description: "Configura o endereço do servidor" },
  { command: "AT+CLIENT=", description: "Configura o Client MQTT" },
  { command: "AT+UNAME=", description: "Configura o usuário MQTT" },
  { command: "AT+PWD=", description: "Configura a senha MQTT" },
  {
    command: "AT+PUBTOPIC=",
    description: "Configura o tópico de publicação MQTT",
  },
  {
    command: "AT+SUBTOPIC=",
    description: "Configura o tópico de subscrição MQTT",
  },
  { command: "AT+CCLK=" },
  { command: "ATZ", description: "Reinicia o DTL/DTN" },
];

export const DEFAULT_USER_COMMAND_LABELS = DEFAULT_USER_COMMANDS.map(
  (definition) => definition.command,
);

export function createDefaultUserCommands(): UserCommand[] {
  return DEFAULT_USER_COMMANDS.map(({ command, description, requiresValue }) => ({
    id: `default:${command}`,
    command,
    description,
    requiresValue: requiresValue ?? command.endsWith("="),
  }));
}
