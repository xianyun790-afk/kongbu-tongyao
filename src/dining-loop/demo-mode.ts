import {normalizeDmApiBase} from './dm-endpoint';
import {browserDmInviteToken} from './dm-invite';
// A static Pages build stays a labeled text demo until a real HTTPS relay is configured.
export const DM_API_BASE=normalizeDmApiBase(import.meta.env.VITE_DM_API_BASE);
export const STATIC_DEMO=!DM_API_BASE;
export const DM_INVITE_TOKEN=browserDmInviteToken();
export const publicAsset=(path:string)=>import.meta.env.BASE_URL+path.replace(/^\//,'');
