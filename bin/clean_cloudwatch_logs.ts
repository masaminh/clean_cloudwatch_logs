#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CleanCloudwatchLogsStack } from '../lib/clean_cloudwatch_logs-stack';

const app = new cdk.App();
const queueArn = app.node.tryGetContext('queue_arn');

/* eslint-disable no-new */
new CleanCloudwatchLogsStack(app, 'CleanCloudwatchLogsStack-ap-northeast-1', {
  env: { region: 'ap-northeast-1' }, queueArn,
});
new CleanCloudwatchLogsStack(app, 'CleanCloudwatchLogsStack-us-east-1', {
  env: { region: 'us-east-1' }, queueArn,
});
/* eslint-enable no-new */
