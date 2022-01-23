export type LogGroupInfoType = {
  name: string;
  retentionInDays?: number;
}

export function isLogGroupInfoType(arg: any): arg is LogGroupInfoType {
  return (
    arg != null
    && typeof arg.name === 'string'
    && (arg.retentionInDays == null || typeof arg.retentionInDays === 'number'));
}

export type LogStreamInfoType = {
  name: string;
}

export function isLogStreamInfoType(arg: any): arg is LogStreamInfoType {
  return (
    arg != null
    && typeof arg.name === 'string'
  );
}
