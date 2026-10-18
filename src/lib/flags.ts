/** Feature flags for modules that are built but not yet accepted for public use. Off unless the environment variable is exactly "1" or "true". */
const on = (v: string | undefined) => v === "1" || v === "true";
export const findYourHillEnabled = () => on(process.env.FEATURE_FIND_YOUR_HILL);
export const hitWhereItHurtsEnabled = () => on(process.env.FEATURE_HIT_WHERE_IT_HURTS);
