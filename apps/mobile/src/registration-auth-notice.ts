import {AUTH_ERROR_FALLBACK,publicAuthError} from '../../../packages/session/src/public-auth-error.ts';

const publicCodes=Object.freeze([
 'invalid_credentials','email_not_confirmed','otp_expired',
 'over_request_rate_limit','over_email_send_rate_limit','weak_password',
 'session_expired','session_not_found',
]);
const allowedNotices=Object.freeze([...new Set(publicCodes.map(code=>publicAuthError({code})))]);

/** Canonical projection used by RegistrationHost and RegistrationScreens.
 * Integrated after the frozen APK7; that delivered artifact is unchanged.
 * Re-admit canonical public text only; never inspect/coerce an unknown object,
 * read its getters, trim input or forward a raw diagnostic. */
export function registrationAuthNotice(error:unknown):string|null{
 if(error===null)return null;
 if(typeof error==='string'){
  const notice=allowedNotices.find(value=>value===error);
  if(notice!==undefined)return notice;
 }
 return AUTH_ERROR_FALLBACK;
}
