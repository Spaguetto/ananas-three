import type {ReviewStatus} from './index';
export interface PlateDate {value:string;status:ReviewStatus;origin:string}
export interface PlatePersonInfo {id:string;birth:PlateDate[];death:PlateDate[];original:string}
