const publicMessages: Readonly<Record<string, string>> = Object.freeze({
  invalid_credentials: 'E-mail ou senha inválidos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  otp_expired: 'O código expirou. Solicite um novo código.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  over_email_send_rate_limit: 'Aguarde um pouco antes de solicitar outro e-mail.',
  weak_password: 'Escolha uma senha mais forte.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
});
export const AUTH_ERROR_FALLBACK = 'Não foi possível concluir a autenticação. Tente novamente.';

export function publicAuthError(error: unknown): string {
  // No raw message/details/hint or interpolation into public output.
  try {
    if (typeof error !== 'object' || error === null) return AUTH_ERROR_FALLBACK;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && Object.hasOwn(publicMessages, code)
      ? publicMessages[code] : AUTH_ERROR_FALLBACK;
  } catch {
    return AUTH_ERROR_FALLBACK;
  }
}
