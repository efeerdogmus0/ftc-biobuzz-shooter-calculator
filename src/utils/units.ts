export const inch = 0.0254;
export const pound = 0.45359237;
export const inertiaImperial = inch * inch * pound;
export const rpm = (value: number) => (value * 2 * Math.PI) / 60;
export const toRPM = (value: number) => (value * 60) / (2 * Math.PI);
export const deg = (value: number) => (value * Math.PI) / 180;
export const toDeg = (value: number) => (value * 180) / Math.PI;
