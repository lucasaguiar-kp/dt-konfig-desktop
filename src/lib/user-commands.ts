import type { KhompDeviceType } from "./constants";

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

export const DEFAULT_LORA_USER_COMMANDS: DefaultCommandDefinition[] = [
  { command: "AT+CFG", description: "Print das configurações do dispositivo." },
  { command: "AT+GETSENSORVALUE=1", description: "Força um reporte / força um uplink." },
  { command: "AT+GETSENSORVALUE=0", description: "Visualiza o que foi medido e printa na tela." },
  { command: "AT+TDC=", description: "Altera o tempo de reporte do dispositivo." },
  { command: "ATZ", description: "Reinicia o dispositivo." },
];

export const DEFAULT_NB_USER_COMMANDS: DefaultCommandDefinition[] = [
  { command: "AT+CFG", description: "Print das configurações do dispositivo." },
  { command: "AT+GETSENSORVALUE=1", description: "Força um reporte / força um uplink." },
  { command: "AT+GETSENSORVALUE=0", description: "Visualiza o que foi medido e printa na tela." },
  {
    command: "AT+QBAND=",
    description:
      "Define as bandas em que o dispositivo irá se conectar. Exemplo: AT+QBAND=2,3,28",
  },
  {
    command: "AT+SERVADDR=",
    description:
      "Configura o endereço e a porta do broker para o qual o device irá se reportar. Exemplo: test.mosquitto.org,1883",
  },
  { command: "AT+CLIENT=", description: "Configura o Client ID do dispositivo." },
  { command: "AT+UNAME=", description: "Configura o usuário do broker MQTT." },
  { command: "AT+PWD=", description: "Configura a senha do usuário MQTT." },
  {
    command: "AT+PUBTOPIC=",
    description:
      'Configura o Tópico de Publicação (Publish). É o "endereço" no servidor para onde o Dragino vai enviar os dados coletados.',
  },
  {
    command: "AT+SUBTOPIC=",
    description:
      'Configura o Tópico de Subscrição (Subscribe). É o "endereço" que o Dragino vai escutar para receber comandos ou configurações vindas do servidor.',
  },
  { command: "AT+TDC=", description: "Define o intervalo de tempo (em segundos) entre os envios automáticos de dados." },
  { command: "AT+APN=", description: "Configura o ponto de acesso (APN) da rede celular da operadora." },
  {
    command: "AT+PRO=",
    description: "Define o protocolo de transporte (ex: MQTT, TCP, UDP) e o formato dos dados.",
  },
];

export const DEFAULT_USER_COMMANDS = DEFAULT_NB_USER_COMMANDS;

export const DEFAULT_USER_COMMAND_LABELS = DEFAULT_USER_COMMANDS.map(
  (definition) => definition.command,
);

export function getDefaultUserCommandDefinitions(deviceType?: KhompDeviceType | null): DefaultCommandDefinition[] {
  return deviceType === "DTL_LORA" ? DEFAULT_LORA_USER_COMMANDS : DEFAULT_NB_USER_COMMANDS;
}

export function createDefaultUserCommands(deviceType?: KhompDeviceType | null): UserCommand[] {
  return getDefaultUserCommandDefinitions(deviceType).map(({ command, description, requiresValue }) => ({
    id: `default:${command}`,
    command,
    description,
    requiresValue: requiresValue ?? command.endsWith("="),
  }));
}
