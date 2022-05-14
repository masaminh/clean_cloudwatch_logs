import { CloudWatchLogsClient, paginateDescribeLogGroups } from '@aws-sdk/client-cloudwatch-logs';
import { LogGroupInfoType } from './common_types';
import { isString } from './type_utils';

type OutputType = {
  eventTime: number,
  targetLogGroups: LogGroupInfoType[],
  noRetentionLogGroups: LogGroupInfoType[],
  emptyLogGroups: LogGroupInfoType[],
}

const client = new CloudWatchLogsClient({ maxAttempts: 5 });

// eslint-disable-next-line import/prefer-default-export
export async function handler(time: unknown): Promise<OutputType> {
  if (!isString(time)) {
    return {
      eventTime: 0,
      targetLogGroups: [],
      noRetentionLogGroups: [],
      emptyLogGroups: [],
    };
  }

  const eventTime = Date.parse(time);
  const thresholdTimeEpoch = eventTime - 7 * 24 * 60 * 60 * 1000;
  const targetLogGroups: LogGroupInfoType[] = [];
  const noRetentionLogGroups: LogGroupInfoType[] = [];
  const emptyLogGroups: LogGroupInfoType[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for await (const page of paginateDescribeLogGroups({ client }, {})) {
    page.logGroups?.forEach((logGroup) => {
      if (logGroup.logGroupName == null) {
        return;
      }

      if ((logGroup.creationTime ?? Number.MAX_SAFE_INTEGER) > thresholdTimeEpoch) {
        return;
      }

      let logGroups: LogGroupInfoType[];

      const logGroupInfo: LogGroupInfoType = {
        name: logGroup.logGroupName,
        retentionInDays: logGroup.retentionInDays,
      };

      if (logGroup.retentionInDays == null) {
        logGroups = noRetentionLogGroups;
      } else if (logGroup.storedBytes === 0) {
        logGroups = emptyLogGroups;
      } else {
        logGroups = targetLogGroups;
      }

      logGroups.push(logGroupInfo);
    });
  }

  return {
    eventTime,
    targetLogGroups,
    noRetentionLogGroups,
    emptyLogGroups,
  };
}
