export type XThreadPart = {caption:string;assetOrders:number[]};
export function buildXThread(caption:string,assetCount:number,mode?:'article'|'media'):XThreadPart[];
