import * as AWSXRay from 'aws-xray-sdk';
import {
  CloudWatchLogsClient, DeleteLogStreamCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { LogStreamInfoType, isLogStreamInfoType } from './common_types';
import { isObject, isString } from './type_utils';

type InputType = {
  logGroupName: string,
  targetLogStreams: LogStreamInfoType[];
}

type OutputType = {}

const client = AWSXRay.captureAWSv3Client(
  new CloudWatchLogsClient({
    maxAttempts: 10,
  }),
);

function isInputType(arg: unknown): arg is InputType {
  return (
    isObject<InputType>(arg)
    && isString(arg.logGroupName)
    && Array.isArray(arg.targetLogStreams)
    && arg.targetLogStreams.every(isLogStreamInfoType)
  );
}

// eslint-disable-next-line import/prefer-default-export
export async function handler(input: unknown): Promise<OutputType> {
  const startTime = Date.now();

  if (!isInputType(input)) {
    return {};
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const logStreamInfo of input.targetLogStreams) {
    // eslint-disable-next-line no-await-in-loop
    await client.send(new DeleteLogStreamCommand({
      logGroupName: input.logGroupName,
      logStreamName: logStreamInfo.name,
    }));

    if (Date.now() - startTime > 10 * 60 * 1000) {
      break;
    }
  }

  return {};
}
