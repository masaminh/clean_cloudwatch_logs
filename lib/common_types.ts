import { isObject, isString, isNumber } from './type_utils';

export type LogGroupInfoType = {
  name: string;
  retentionInDays?: number;
  region: string;
}

export function isLogGroupInfoType(arg: unknown): arg is LogGroupInfoType {
  return (
    isObject<LogGroupInfoType>(arg)
    && isString(arg.name)
    && (arg.retentionInDays == null || isNumber(arg.retentionInDays))
    && isString(arg.region)
  );
}

export type LogStreamInfoType = {
  name: string;
}

export function isLogStreamInfoType(arg: unknown): arg is LogStreamInfoType {
  return (
    isObject<LogStreamInfoType>(arg)
    && isString(arg.name)
  );
}
