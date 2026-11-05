// This public GitHub Pages edition is intentionally a static text-host demo.
export const STATIC_DEMO=true;
export const publicAsset=(path:string)=>import.meta.env.BASE_URL+path.replace(/^\//,'');
