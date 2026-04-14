export interface ProviderField {
  key: string;
  label: string;
  type?: 'password' | 'text';
}

export interface ProviderDef {
  label: string;
  fields: ProviderField[];
}

export const PROVIDERS: Record<string, ProviderDef> = {
  gmail: { label: 'Gmail', fields: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh Token', type: 'password' },
  ]},
  google_maps: { label: 'Google Maps', fields: [
    { key: 'apiKey', label: 'API Key', type: 'password' },
  ]},
  hunter_io: { label: 'Hunter.io', fields: [
    { key: 'apiKey', label: 'API Key', type: 'password' },
  ]},
  telegram: { label: 'Telegram', fields: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
  ]},
  tavily: { label: 'Tavily', fields: [
    { key: 'apiKey', label: 'API Key', type: 'password' },
  ]},
  custom: { label: 'Custom', fields: [] },
};
