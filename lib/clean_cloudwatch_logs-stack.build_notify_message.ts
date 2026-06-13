import { isObject, isString } from './type_utils'

type GetLogStreamsResultType = {
  logGroupName: string;
  isEmpty: boolean;
  region: string;
}

type InputType = {
  getLogStreamsResults: GetLogStreamsResultType[];
}

type OutputType = {
  notifyMessage: string;
}

function isGetLogStreamsResultType (arg: unknown): arg is GetLogStreamsResultType {
  return (
    isObject<GetLogStreamsResultType>(arg) &&
    isString(arg.logGroupName) &&
    typeof arg.isEmpty === 'boolean' &&
    isString(arg.region)
  )
}

function isInputType (arg: unknown): arg is InputType {
  return (
    isObject<InputType>(arg) &&
    Array.isArray(arg.getLogStreamsResults) &&
    arg.getLogStreamsResults.every(isGetLogStreamsResultType)
  )
}

export function buildNotifyMessageLine (region: string, logGroupName: string): string {
  return `Region: ${region}, Loggroup: ${logGroupName} is empty.`
}

export function buildCloudWatchLogsUrl (region: string): string {
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups`
}

export async function handler (input: unknown): Promise<OutputType> {
  if (!isInputType(input)) {
    return { notifyMessage: '' }
  }

  const emptyResults = input.getLogStreamsResults.filter((result) => result.isEmpty)
  const lines = emptyResults.map((result) => buildNotifyMessageLine(result.region, result.logGroupName))

  return {
    notifyMessage: lines.length > 0
      ? `${lines.join('\n')}\n${buildCloudWatchLogsUrl(emptyResults[0].region)}`
      : '',
  }
}
