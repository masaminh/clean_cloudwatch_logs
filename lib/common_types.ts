import { isObject, isString, isNumber } from './type_utils';

export type LogGroupInfoType = {
  name: string;
  retentionInDays?: number;
}

export function isLogGroupInfoType(arg: unknown): arg is LogGroupInfoType {
  return (
    isObject<LogGroupInfoType>(arg)
    && isString(arg.name)
    && (arg.retentionInDays == null || isNumber(arg.retentionInDays)));
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
