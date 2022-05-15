import * as AWSXRay from 'aws-xray-sdk';
import { CloudWatchLogsClient, paginateDescribeLogStreams } from '@aws-sdk/client-cloudwatch-logs';
import { LogStreamInfoType, isLogGroupInfoType, LogGroupInfoType } from './common_types';
import { isObject, isNumber } from './type_utils';

type InputType = {
  eventTime: number;
  logGroupInfo: LogGroupInfoType;
}

type OutputType = {
  logGroupName: string,
  targetLogStreams: LogStreamInfoType[];
  isEmpty: boolean;
}

const client = AWSXRay.captureAWSv3Client(
  new CloudWatchLogsClient({
    maxAttempts: 10,
  }),
);

function isInputType(arg: unknown): arg is InputType {
  return (
    isObject<InputType>(arg)
    && isNumber(arg.eventTime)
    && isLogGroupInfoType(arg.logGroupInfo)
  );
}

// eslint-disable-next-line import/prefer-default-export
export async function handler(input: unknown): Promise<OutputType> {
  if (!isInputType(input)) {
    return {
      logGroupName: '',
      targetLogStreams: [],
      isEmpty: false,
    };
  }

  const { logGroupInfo } = input;

  const logGroupName = logGroupInfo.name;
  const { retentionInDays } = logGroupInfo;

  if (retentionInDays == null) {
    return {
      logGroupName: '',
      targetLogStreams: [],
      isEmpty: false,
    };
  }

  const targetLogStreams: LogStreamInfoType[] = [];
  let isEmpty = true;

  // eslint-disable-next-line no-restricted-syntax
  for await (const page of paginateDescribeLogStreams({ client }, {
    logGroupName,
  })) {
    if (page.logStreams != null && page.logStreams.length > 0) {
      isEmpty = false;
    }

    page.logStreams?.forEach((logStream) => {
      if (logStream.logStreamName == null) {
        return;
      }

      if (logStream.lastIngestionTime == null) {
        return;
      }

      const threshold = input.eventTime - retentionInDays * 24 * 60 * 60 * 1000;

      if (logStream.lastIngestionTime > threshold) {
        return;
      }

      targetLogStreams.push({
        name: logStream.logStreamName,
      });
    });
  }

  return {
    logGroupName,
    targetLogStreams,
    isEmpty,
  };
}
