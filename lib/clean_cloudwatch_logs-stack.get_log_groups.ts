import { CloudWatchLogsClient, paginateDescribeLogGroups } from '@aws-sdk/client-cloudwatch-logs'
import { LogGroupInfoType } from './common_types'
import { isString } from './type_utils'

type OutputType = {
  eventTime: number,
  targetLogGroups: LogGroupInfoType[],
  noRetentionLogGroups: LogGroupInfoType[],
}

const client = new CloudWatchLogsClient({ maxAttempts: 5 })

export async function handler (time: unknown): Promise<OutputType> {
  if (!isString(time)) {
    return {
      eventTime: 0,
      targetLogGroups: [],
      noRetentionLogGroups: [],
    }
  }

  const eventTime = Date.parse(time)
  const thresholdTimeEpoch = eventTime - 7 * 24 * 60 * 60 * 1000
  const targetLogGroups: LogGroupInfoType[] = []
  const noRetentionLogGroups: LogGroupInfoType[] = []

  for await (const page of paginateDescribeLogGroups({ client }, {})) {
    page.logGroups?.forEach((logGroup) => {
      if (logGroup.logGroupName == null) {
        return
      }

      if ((logGroup.creationTime ?? Number.MAX_SAFE_INTEGER) > thresholdTimeEpoch) {
        return
      }

      let logGroups: LogGroupInfoType[]

      const logGroupInfo: LogGroupInfoType = {
        name: logGroup.logGroupName,
        retentionInDays: logGroup.retentionInDays,
        region: logGroup.arn?.split(':')[3] ?? '-',
      }

      if (logGroup.retentionInDays == null) {
        logGroups = noRetentionLogGroups
      } else {
        logGroups = targetLogGroups
      }

      logGroups.push(logGroupInfo)
    })
  }

  return {
    eventTime,
    targetLogGroups,
    noRetentionLogGroups,
  }
}
