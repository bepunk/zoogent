import { describe, it, expect } from 'vitest';
import { toUpperSnake } from '../src/core/process-manager.js';

describe('toUpperSnake (integration field → env var suffix)', () => {
  it('keeps UPPER_SNAKE_CASE as-is', () => {
    expect(toUpperSnake('API_KEY')).toBe('API_KEY');
    expect(toUpperSnake('BOT_TOKEN')).toBe('BOT_TOKEN');
    expect(toUpperSnake('AUTHORIZED_CHAT_ID')).toBe('AUTHORIZED_CHAT_ID');
    expect(toUpperSnake('HTTP2_KEY')).toBe('HTTP2_KEY');
  });

  it('converts camelCase', () => {
    expect(toUpperSnake('apiKey')).toBe('API_KEY');
    expect(toUpperSnake('botToken')).toBe('BOT_TOKEN');
    expect(toUpperSnake('authorizedChatId')).toBe('AUTHORIZED_CHAT_ID');
    expect(toUpperSnake('id')).toBe('ID');
  });

  it('converts PascalCase without leading underscore', () => {
    expect(toUpperSnake('ApiKey')).toBe('API_KEY');
    expect(toUpperSnake('AuthorizedChatId')).toBe('AUTHORIZED_CHAT_ID');
    expect(toUpperSnake('HTTPServer')).toBe('HTTP_SERVER');
  });

  it('handles lowercase only', () => {
    expect(toUpperSnake('token')).toBe('TOKEN');
    expect(toUpperSnake('secret')).toBe('SECRET');
  });

  it('handles acronyms inside camelCase', () => {
    expect(toUpperSnake('parseJSON')).toBe('PARSE_JSON');
    expect(toUpperSnake('myAPIKey')).toBe('MY_API_KEY');
  });

  // The original bug: UPPER_SNAKE_CASE inputs were getting an underscore
  // inserted before every uppercase letter, producing things like
  // "_A_P_I__K_E_Y" instead of "API_KEY".
  it('regression: UPPER_SNAKE_CASE does not get exploded', () => {
    expect(toUpperSnake('API_KEY')).not.toContain('_A_');
    expect(toUpperSnake('BOT_TOKEN')).not.toContain('_B_');
  });
});
